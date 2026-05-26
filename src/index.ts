import bcrypt from 'bcrypt';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore - This warning disappears completely right after you run your first Prisma migration below
import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const adapter = new PrismaLibSql({
	url: process.env.TURSO_DATABASE_URL || 'file:./prisma/dev.db',
	authToken: process.env.TURSO_AUTH_TOKEN || ''
});

const prisma = new PrismaClient({ adapter });

// Health Check
app.get('/api/health', (req, res) => {
	res.json({ status: 'Server is running smoothly!' });
});

// ==========================================
// 👤 DRIVER MANAGEMENT ENDPOINTS
// ==========================================

// Get all unique drivers (great for populating frontend pickers/lists)
app.get('/api/drivers', async (req, res) => {
	try {
		const drivers = await prisma.driver.findMany({
			orderBy: { name: 'asc' },
			include: {
				_count: {
					select: { trips: true, expenses: true } // Pulls basic metrics automatically
				}
			}
		});
		res.json(drivers);
	} catch (error) {
		console.error('Error fetching drivers:', error);
		res.status(500).json({ error: 'Failed to retrieve drivers' });
	}
});

// ==========================================
// 🚘 TRIP MANAGEMENT ENDPOINTS
// ==========================================

// Log a New Trip (Create)
app.post('/api/trips', async (req, res) => {
	try {
		const { driverName, notes, startDateTime } = req.body;

		if (!driverName || !driverName.trim()) {
			return res.status(400).json({ error: 'Driver name is required' });
		}

		// Smart Upsert: Find the driver by unique name or create them on the fly
		const driver = await prisma.driver.upsert({
			where: { name: driverName.trim() },
			update: {},
			create: { name: driverName.trim() }
		});

		const newTrip = await prisma.trip.create({
			data: {
				driverId: driver.id, // Relational connection
				notes,
				startDateTime: startDateTime ? new Date(startDateTime) : new Date()
			},
			include: { driver: true }
		});

		res.status(201).json(newTrip);
	} catch (error) {
		console.error('Error creating trip:', error);
		res.status(500).json({ error: 'Failed to log trip to database' });
	}
});

// View All Trips (Read)
app.get('/api/trips', async (req, res) => {
	try {
		const trips = await prisma.trip.findMany({
			orderBy: {
				startDateTime: 'desc'
			},
			include: {
				driver: true // Injects the full driver object into the response
			}
		});
		res.json(trips);
	} catch (error) {
		console.error('Error fetching trips:', error);
		res.status(500).json({ error: 'Failed to retrieve trips' });
	}
});

// ==========================================
// 💸 EXPENSE MANAGEMENT ENDPOINTS
// ==========================================

app.post('/api/expenses', async (req, res) => {
	try {
		// 1. Pull the flat properties sent directly by api.createExpense()
		const {
			type,
			amount,
			dateTime,
			status,
			notes,
			tripId,
			manualDriverName,
			confirmSuggestedDriver
		} = req.body;

		// 2. Simple numeric extraction fallback check
		const parsedAmount = parseFloat(amount);
		if (isNaN(parsedAmount)) {
			console.error('Expense logging failed: Amount received:', amount);
			return res.status(400).json({
				success: false,
				message: 'Invalid numeric amount received.'
			});
		}

		const expenseDate = new Date(dateTime || Date.now());
		let targetDriverId: string | null = null;
		let resolvedTripId: string | null = tripId || null;

		// SCENARIO 1: Manual Driver Selection OR Confirmed Suggestion
		if (manualDriverName && manualDriverName.trim()) {
			const driver = await prisma.driver.upsert({
				where: { name: manualDriverName.trim() },
				update: {},
				create: { name: manualDriverName.trim() }
			});
			targetDriverId = driver.id;

			if (!resolvedTripId && confirmSuggestedDriver) {
				const matchingTrip = await prisma.trip.findFirst({
					where: {
						driverId: targetDriverId,
						startDateTime: { lte: expenseDate }
					},
					orderBy: { startDateTime: 'desc' }
				});
				if (matchingTrip) resolvedTripId = matchingTrip.id;
			}
		}
		// SCENARIO 2: Frontend linked a Trip directly
		else if (resolvedTripId) {
			const existingTrip = await prisma.trip.findUnique({
				where: { id: resolvedTripId },
				include: { driver: true }
			});
			if (existingTrip) {
				targetDriverId = existingTrip.driverId;
			}
		}

		// SCENARIO 3: Route directly to Unassigned Queue fallback
		if (!targetDriverId) {
			const fallbackDriver = await prisma.driver.upsert({
				where: { name: 'Unassigned Fleet Driver' },
				update: {},
				create: { name: 'Unassigned Fleet Driver' }
			});
			targetDriverId = fallbackDriver.id;
		}

		// 3. Write securely to database logs matching schema parameters exactly
		const newExpense = await prisma.expense.create({
			data: {
				type,
				amount: parsedAmount,
				dateTime: expenseDate,
				status: status || 'Unpaid',
				notes,
				driverId: targetDriverId,
				tripId: resolvedTripId
			},
			include: {
				driver: true,
				trip: true
			}
		});

		res.status(201).json(newExpense);
	} catch (error) {
		console.error('Error creating expense:', error);
		res.status(500).json({ error: 'Failed to log expense' });
	}
});

// View All Expenses (Read)
app.get('/api/expenses', async (req, res) => {
	try {
		const expenses = await prisma.expense.findMany({
			orderBy: { dateTime: 'desc' },
			include: {
				driver: true,
				trip: true
			}
		});
		res.json(expenses);
	} catch (error) {
		console.error('Error fetching expenses:', error);
		res.status(500).json({ error: 'Failed to retrieve expenses' });
	}
});

// Update an existing Expense (e.g., re-assigning from the Triage Queue)
app.put('/api/expenses/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const { manualDriverName } = req.body;

		if (!manualDriverName || !manualDriverName.trim()) {
			return res
				.status(400)
				.json({ error: 'Driver name is required for reassignment' });
		}

		// Find or create the real driver being assigned
		const driver = await prisma.driver.upsert({
			where: { name: manualDriverName.trim() },
			update: {},
			create: { name: manualDriverName.trim() }
		});

		// Check if there is an active trip for this driver around the same time if needed,
		// but for a direct triage override, we link the driver directly.
		const updatedExpense = await prisma.expense.update({
			where: { id: id },
			data: {
				driverId: driver.id
			},
			include: {
				driver: true,
				trip: true
			}
		});

		res.json(updatedExpense);
	} catch (error) {
		console.error('Error updating expense assignment:', error);
		res.status(500).json({ error: 'Failed to update expense assignment' });
	}
});

// Triage Queue: Fetch only expenses that require human allocation
app.get('/api/expenses/unassigned', async (req, res) => {
	try {
		const unassignedExpenses = await prisma.expense.findMany({
			where: {
				driver: {
					name: 'Unassigned Fleet Driver'
				}
			},
			orderBy: { dateTime: 'desc' },
			include: { driver: true }
		});

		res.json({
			count: unassignedExpenses.length,
			expenses: unassignedExpenses
		});
	} catch (error) {
		console.error('Error fetching unassigned expenses:', error);
		res.status(500).json({ error: 'Failed to look up unassigned queue' });
	}
});

// Smart Match Engine: UI Helper endpoint to preview who had the van
app.get('/api/expenses/match-driver', async (req, res) => {
	try {
		const { timestamp } = req.query;
		if (!timestamp)
			return res.status(400).json({ error: 'Missing timestamp parameter' });

		const targetTime = new Date(timestamp as string);

		const matchingTrip = await prisma.trip.findFirst({
			where: {
				startDateTime: { lte: targetTime }
			},
			orderBy: { startDateTime: 'desc' },
			include: { driver: true }
		});

		res.json({ matchingTrip });
	} catch (error) {
		res.status(500).json({ error: 'Driver lookup engine failed' });
	}
});

// ==========================================
// 🔑 LOGIN MANAGEMENT ENDPOINTS
// ==========================================

// Global Login Gatekeeper
app.post('/api/login', async (req, res) => {
	try {
		const { password } = req.body;

		if (!password) {
			res.status(400).json({ success: false, message: 'Password is required' });
			return;
		}

		// Grab our single configuration row from the database
		const config = await prisma.systemConfig.findUnique({
			where: { id: 1 }
		});

		if (!config) {
			// Fallback safety if database wasn't seeded yet
			res
				.status(500)
				.json({ success: false, message: 'System not configured' });
			return;
		}

		// Compare the plaintext password input against our stored secure hash
		const isMatch = await bcrypt.compare(password, config.adminPasswordHash);

		if (isMatch) {
			res.json({ success: true, token: 'authenticated-session-token' });
		} else {
			res.status(401).json({ success: false, message: 'Invalid password!' });
		}
	} catch (error) {
		console.error('Login system error:', error);
		res.status(500).json({ success: false, message: 'Internal Server Error' });
	}
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
	console.log(`Server blasting off on port ${PORT}`);
});
