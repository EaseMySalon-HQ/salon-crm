# EaseMySalon CRM

A comprehensive salon and spa management system with appointment scheduling, point-of-sale, client management, inventory, and reporting.

## Features

- **Appointments** – Calendar-based scheduling with multi-staff assignment
- **Quick Sale / POS** – Multi-payment support (Cash, Card, Online), receipts, tax handling
- **Client Management** – Profiles, visit history, spending analytics
- **Services & Products** – Catalog management with Excel/CSV import
- **Inventory** – Stock tracking, consumption rules, low-stock alerts
- **Cash Registry** – Opening/closing balances, daily summaries
- **Reports** – Sales, staff performance, service list, deleted invoices
- **Memberships** – Plans, subscriptions, usage tracking

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Shadcn/ui
- **Backend**: Node.js, Express.js, MongoDB, Mongoose

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB (local or cloud)

### Installation

```bash
# Clone the repository
git clone https://github.com/EaseMySalon-HQ/salon-crm.git
cd salon-crm

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install
```

### Environment Setup

1. **Backend** – Copy `backend/.env.example` to `backend/.env`:
   - `PORT` – API port (default: 3001)
   - `JWT_SECRET` – Secret for JWT tokens
   - `MONGODB_URI` – MongoDB connection string
   - `CORS_ORIGIN` – Frontend URL (e.g. http://localhost:3000)

2. **Frontend** – Create `.env.local`:
   - `NEXT_PUBLIC_API_URL` – Backend API URL (e.g. http://localhost:3001/api)

### Run Development

```bash
# Terminal 1 – Backend
cd backend && npm run dev

# Terminal 2 – Frontend
npm run dev
```

- Frontend: http://localhost:3000  
- Backend API: http://localhost:3001

## Project Structure

```
salon-crm/
├── app/                    # Next.js app router pages
├── components/             # React components
├── lib/                    # API client, utilities
├── backend/                # Express API server
│   ├── server.js          # Main server
│   ├── models/            # Mongoose models
│   └── utils/             # Report exporters, etc.
└── docs/                   # Feature documentation
```

## Documentation

- [Documentation Overview](docs/README.md)
- [Quick Sale System](docs/QUICK_SALE.md)
- [Reports & Analytics](docs/REPORTS_ANALYTICS.md)
- [Demo Guide](SALON_CRM_DEMO_GUIDE.md)
- [Backend API](backend/README.md)

## Import Templates

- **Products** – Name, Category, Cost Price, Selling Price, Offer Price, Stock, Volume, Tax Category, Product Type, etc.
- **Services** – Name, Category, Duration, Full Price, Offer Price, Description, Tax Applicable, HSN/SAC Code

## License

See repository license file.
