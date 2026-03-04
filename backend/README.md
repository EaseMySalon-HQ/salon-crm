# EaseMySalon Backend API

A Node.js/Express.js backend API for the EaseMySalon system.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### Clients
- `GET /api/clients` - Get all clients (with pagination)
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/search?q=query` - Search clients

### Services
- `GET /api/services` - Get all services
- `POST /api/services` - Create new service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Products
- `GET /api/products` - Get all products
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `PATCH /api/products/:id/stock` - Update product stock

### Appointments
- `GET /api/appointments` - Get all appointments
- `POST /api/appointments` - Create new appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment
- `PATCH /api/appointments/:id/status` - Update appointment status

### Receipts
- `GET /api/receipts` - Get all receipts
- `POST /api/receipts` - Create new receipt
- `GET /api/receipts/client/:clientId` - Get receipts by client

### Reports
- `GET /api/reports/dashboard` - Get dashboard statistics

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Demo Users

The API includes demo users for testing:

| Email | Password | Role |
|-------|----------|------|
| admin@salon.com | admin123 | admin |
| manager@salon.com | manager123 | manager |
| staff@salon.com | staff123 | staff |

## 📊 Data Structure

### Client
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "address": "string",
  "notes": "string",
  "status": "active|inactive",
  "totalVisits": "number",
  "totalSpent": "number",
  "lastVisit": "string",
  "createdAt": "string"
}
```

### Service
```json
{
  "id": "string",
  "name": "string",
  "category": "string",
  "duration": "number",
  "price": "number",
  "description": "string",
  "isActive": "boolean"
}
```

### Product
```json
{
  "id": "string",
  "name": "string",
  "category": "string",
  "price": "number",
  "stock": "number",
  "sku": "string",
  "supplier": "string",
  "description": "string",
  "isActive": "boolean"
}
```

### Appointment
```json
{
  "id": "string",
  "clientId": "string",
  "serviceId": "string",
  "staffId": "string",
  "date": "string",
  "time": "string",
  "duration": "number",
  "status": "scheduled|completed|cancelled|no-show",
  "notes": "string",
  "price": "number"
}
```

### Receipt
```json
{
  "id": "string",
  "receiptNumber": "string",
  "clientId": "string",
  "staffId": "string",
  "date": "string",
  "time": "string",
  "items": "array",
  "subtotal": "number",
  "tip": "number",
  "discount": "number",
  "tax": "number",
  "total": "number",
  "payments": "array",
  "notes": "string"
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=3001

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key

# Database Configuration (for future use)
DATABASE_URL=your-database-url

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

## 🛠️ Development

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (not implemented yet)

### Project Structure

```
backend/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── .env              # Environment variables
├── .env.example      # Environment variables template
└── README.md         # This file
```

## 🚀 Production Deployment

### Environment Setup

1. Set production environment variables
2. Use a proper database (MySQL, PostgreSQL, MongoDB)
3. Set up proper logging
4. Configure CORS for production domain
5. Set up SSL/TLS certificates

### Database Integration

Currently using in-memory storage. For production, integrate with:

- **MySQL/PostgreSQL**: Use Sequelize or Prisma
- **MongoDB**: Use Mongoose
- **SQLite**: For simple deployments

### Security Considerations

- Use strong JWT secrets
- Implement rate limiting
- Add input validation
- Set up proper CORS
- Use HTTPS in production
- Implement proper error handling

## 📝 API Response Format

All API responses follow this format:

```json
{
  "success": "boolean",
  "data": "any",
  "message": "string (optional)",
  "error": "string (optional)"
}
```

For paginated responses:

```json
{
  "success": "boolean",
  "data": "array",
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

## 🔍 Testing the API

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@salon.com", "password": "admin123"}'
```

### Get Clients (with token)
```bash
curl http://localhost:3001/api/clients \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License. 