# 🎯 EaseMySalon - Complete Demo Guide

## 📋 Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Appointment Management](#appointment-management)
4. [Quick Sale & Billing](#quick-sale--billing)
5. [Client Management](#client-management)
6. [Service Management](#service-management)
7. [Product & Inventory Management](#product--inventory-management)
8. [Staff Management](#staff-management)
9. [Reports & Analytics](#reports--analytics)
10. [Settings & Configuration](#settings--configuration)
11. [Receipt Management](#receipt-management)
12. [Cash Registry](#cash-registry)

---

## 🚀 Getting Started

### **Access the Application**
1. **URL**: `http://localhost:3000`
2. **Login**: Use your credentials to access the system
3. **Role-based Access**: Different features based on your role (Admin/Manager/Staff)

### **Navigation Overview**
- **Main Menu**: Left sidebar with all major features
- **Quick Actions**: Dashboard buttons for common tasks
- **Breadcrumbs**: Shows current page location
- **User Profile**: Top-right corner with logout option

---

## 📊 Dashboard Overview

### **Navigation**: `Dashboard` (Home page)

### **Key Features**:
1. **Welcome Section**
   - Gradient header with salon branding
   - Quick action buttons for "New Appointment" and "Quick Sale"

2. **Key Metrics Cards**
   - Total Revenue
   - Today's Appointments
   - Active Clients
   - Products Sold

3. **Monthly Overview Chart**
   - Revenue trends
   - Appointment statistics
   - Visual analytics

4. **Recent Appointments**
   - Latest scheduled appointments
   - Quick status overview

5. **Service Analytics**
   - Service performance metrics
   - Popular services tracking

6. **Inventory Overview**
   - Product stock levels
   - Low stock alerts

### **Demo Steps**:
1. View the dashboard metrics
2. Click on "New Appointment" to create a booking
3. Click on "Quick Sale" to process a transaction
4. Explore the different metric cards and charts

---

## 📅 Appointment Management

### **Navigation**: `Appointments` → `View All` or `New Appointment`

### **Features**:

#### **A. View All Appointments** (`/appointments`)
- **Calendar View**: Monthly/weekly/daily calendar
- **List View**: Tabular format with filters
- **Status Management**: Pending, Confirmed, Completed, Cancelled
- **Search & Filter**: By client, service, date, status
- **Bulk Actions**: Select multiple appointments for actions

#### **B. Create New Appointment** (`/appointments/new`)
- **Client Selection**: Search existing or add new client
- **Service Selection**: Choose from available services
- **Staff Assignment**: Assign to specific staff member
- **Date & Time**: Calendar picker with time slots
- **Notes**: Additional appointment details
- **Recurring Appointments**: Set up repeat bookings

### **Demo Steps**:
1. **Create Appointment**:
   - Click "New Appointment" from dashboard
   - Select or add a client
   - Choose a service
   - Pick date and time
   - Assign to staff member
   - Add notes if needed
   - Save appointment

2. **Manage Appointments**:
   - Go to Appointments page
   - Use filters to find specific appointments
   - Click on appointment to edit details
   - Change status (Confirm, Complete, Cancel)
   - Use bulk actions for multiple appointments

---

## 💰 Quick Sale & Billing

### **Navigation**: `Quick Sale` or Dashboard → "Quick Sale" button

### **Features**:

#### **A. Service Selection**
- Browse available services
- Add services to cart
- Adjust quantities
- Apply discounts

#### **B. Product Selection**
- Browse product catalog
- Check stock availability
- Add products to cart
- Manage quantities

#### **C. Billing Summary**
- **Subtotal**: Before tax calculation
- **Tax (GST)**: Automatic tax calculation based on:
  - Service Tax: 5% (configurable)
  - Product Tax: Based on category (5%, 12%, 18%, 28%, 0%)
- **Discount**: Manual discount application
- **Tip**: Optional tip addition
- **Round Off**: Automatic rounding to nearest rupee
- **Total**: Final amount to pay

#### **D. Payment Processing**
- **Cash Payment**: Enter cash amount
- **Card Payment**: Card transaction details
- **Online Payment**: Digital payment methods
- **Split Payment**: Multiple payment methods
- **Change Calculation**: Automatic change calculation

#### **E. Receipt Generation**
- **Print Receipt**: Standard A4 receipt
- **Thermal Print**: 80mm thermal printer receipt
- **Download PDF**: Save receipt as PDF
- **Email Receipt**: Send to client email

### **Demo Steps**:
1. **Start Quick Sale**:
   - Click "Quick Sale" from dashboard
   - Add services (e.g., Hydra Facial - ₹2,000)
   - Add products (e.g., Loreal Shampoo - ₹1,000, Hair Oil - ₹15)
   - Observe automatic tax calculation

2. **Review Billing**:
   - Check subtotal: ₹3,015
   - Verify tax breakdown:
     - Service Tax (5%): ₹100
     - Product Tax (18%): ₹180
     - Product Tax (5%): ₹0.75
   - Total Tax: ₹280.75
   - Grand Total: ₹3,296 (with round off)

3. **Process Payment**:
   - Enter payment details
   - Complete transaction
   - Generate receipt

---

## 👥 Client Management

### **Navigation**: `Clients` → `View All` or `New Client`

### **Features**:

#### **A. Client Directory** (`/clients`)
- **Client List**: All registered clients
- **Search & Filter**: By name, phone, email
- **Client Cards**: Quick overview with contact info
- **Status Indicators**: Active, inactive clients
- **Quick Actions**: View, edit, delete clients

#### **B. Client Details** (`/clients/[id]`)
- **Personal Information**: Name, phone, email, address
- **Appointment History**: Past and upcoming appointments
- **Service History**: Services availed
- **Purchase History**: Products purchased
- **Notes & Preferences**: Special requirements
- **Communication Log**: SMS, email history

#### **C. Add New Client** (`/clients/new`)
- **Basic Information**: Name, phone, email
- **Address Details**: Complete address
- **Emergency Contact**: Emergency contact info
- **Preferences**: Service preferences, allergies
- **Marketing Consent**: SMS/email preferences

### **Demo Steps**:
1. **View Clients**:
   - Go to Clients page
   - Browse client list
   - Use search to find specific clients
   - Click on client card to view details

2. **Add New Client**:
   - Click "New Client" button
   - Fill in basic information
   - Add address and preferences
   - Save client

3. **Client Details**:
   - Click on any client
   - View appointment history
   - Check service and purchase history
   - Add notes or update information

---

## 🛠️ Service Management

### **Navigation**: `Services` → `View All` or `New Service`

### **Features**:

#### **A. Service Catalog** (`/services`)
- **Service List**: All available services
- **Categories**: Grouped by service type
- **Pricing**: Service rates and duration
- **Status**: Active/inactive services
- **Popularity**: Most booked services

#### **B. Service Details**
- **Basic Info**: Name, description, category
- **Pricing**: Base price, duration
- **Tax Settings**: Tax category and rates
- **Staff Assignment**: Which staff can perform
- **Requirements**: Special equipment or products
- **Booking Rules**: Advance booking requirements

#### **C. Add/Edit Service** (`/services/new`)
- **Service Information**: Name, description, category
- **Pricing**: Set base price and duration
- **Tax Category**: Select appropriate tax rate
- **Staff Permissions**: Assign to specific staff
- **Booking Settings**: Minimum advance booking time
- **Service Image**: Upload service photos

### **Demo Steps**:
1. **View Services**:
   - Go to Services page
   - Browse service catalog
   - Check pricing and categories
   - View service details

2. **Add New Service**:
   - Click "New Service" button
   - Enter service details
   - Set pricing and duration
   - Assign tax category
   - Save service

3. **Edit Service**:
   - Click on any service
   - Update pricing or details
   - Change tax category
   - Save changes

---

## 📦 Product & Inventory Management

### **Navigation**: `Products` → `View All` or `New Product`

### **Features**:

#### **A. Product Catalog** (`/products`)
- **Product List**: All available products
- **Stock Levels**: Current inventory
- **Categories**: Product categories
- **Pricing**: Product rates
- **Tax Categories**: GST tax rates (5%, 12%, 18%, 28%, 0%)
- **Low Stock Alerts**: Automatic notifications

#### **B. Product Details**
- **Basic Information**: Name, SKU, description
- **Pricing**: Cost price, selling price
- **Tax Category**: Essential (5%), Intermediate (12%), Standard (18%), Luxury (28%), Exempt (0%)
- **Stock Management**: Current stock, reorder level
- **Supplier Information**: Vendor details
- **Product Images**: Photo gallery

#### **C. Inventory Management**
- **Stock Tracking**: Real-time inventory
- **Inventory Logs**: Track all movements
- **Restock Alerts**: Low stock notifications
- **Stock Adjustments**: Manual stock updates
- **Supplier Management**: Vendor information

#### **D. Inventory Logs** (`Inventory Logs` button)
- **Transaction History**: All stock movements
- **Color Coding**: 
  - 🔴 Red: Deductions (sales, damage)
  - 🟢 Green: Additions (restock, returns)
- **Filter Options**: By date, type, product
- **Export**: Download transaction reports

### **Demo Steps**:
1. **View Products**:
   - Go to Products page
   - Browse product catalog
   - Check stock levels
   - View product details

2. **Add New Product**:
   - Click "New Product" button
   - Enter product information
   - Set pricing and tax category
   - Add stock quantity
   - Save product

3. **Manage Inventory**:
   - Click "Inventory Logs" button
   - View transaction history
   - Filter by date or type
   - Check stock movements

4. **Update Stock**:
   - Click on any product
   - Update stock quantity
   - Add supplier information
   - Save changes

---

## 👨‍💼 Staff Management

### **Navigation**: `Users` → `View All` or `New User`

### **Features**:

#### **A. Staff Directory** (`/users`)
- **Staff List**: All system users
- **Role Management**: Admin, Manager, Staff
- **Status**: Active/inactive users
- **Permissions**: Role-based access control
- **Contact Information**: Staff details

#### **B. User Roles**
- **Admin**: Full system access
- **Manager**: Limited administrative access
- **Staff**: Basic operational access

#### **C. Add/Edit Staff** (`/users/new`)
- **Personal Information**: Name, email, phone
- **Role Assignment**: Admin, Manager, or Staff
- **Login Credentials**: Username and password
- **Permissions**: Specific feature access
- **Profile Settings**: Avatar, preferences

### **Demo Steps**:
1. **View Staff**:
   - Go to Users page
   - Browse staff directory
   - Check roles and permissions
   - View staff details

2. **Add New Staff**:
   - Click "New User" button
   - Enter staff information
   - Assign appropriate role
   - Set login credentials
   - Save user

3. **Edit Staff**:
   - Click on any staff member
   - Update role or permissions
   - Change contact information
   - Save changes

---

## 📈 Reports & Analytics

### **Navigation**: `Reports`

### **Features**:

#### **A. Sales Reports**
- **Daily/Weekly/Monthly**: Revenue breakdown
- **Service Performance**: Top services by revenue
- **Product Sales**: Best-selling products
- **Staff Performance**: Individual staff metrics
- **Payment Methods**: Cash vs card vs online

#### **B. Appointment Reports**
- **Booking Trends**: Appointment patterns
- **Cancellation Rates**: No-show analysis
- **Staff Utilization**: Staff workload
- **Client Retention**: Repeat customer analysis

#### **C. Financial Reports**
- **Revenue Summary**: Total earnings
- **Tax Reports**: GST calculations
- **Commission Reports**: Staff commissions
- **Profit Analysis**: Revenue vs costs

#### **D. Inventory Reports**
- **Stock Levels**: Current inventory
- **Low Stock Alerts**: Reorder notifications
- **Movement Reports**: Stock in/out
- **Supplier Analysis**: Vendor performance

### **Demo Steps**:
1. **View Reports**:
   - Go to Reports page
   - Select report type
   - Choose date range
   - Generate report

2. **Export Reports**:
   - Click export button
   - Choose format (PDF, Excel)
   - Download report

---

## ⚙️ Settings & Configuration

### **Navigation**: `Settings`

### **Features**:

#### **A. General Settings**
- **Application Preferences**: Language, timezone
- **Theme Settings**: Light/dark mode
- **Notification Preferences**: Alerts and reminders

#### **B. Business Settings** (Admin only)
- **Company Information**: Name, address, contact
- **Business Hours**: Operating hours
- **Logo & Branding**: Company logo
- **Contact Details**: Phone, email, website

#### **C. Tax Settings** (Admin only)
- **GST Configuration**: Tax rates and categories
- **Service Tax**: Default service tax rate
- **Product Tax Categories**:
  - Essential Products: 5% GST
  - Intermediate Products: 12% GST
  - Standard Products: 18% GST
  - Luxury Products: 28% GST
  - Exempt Products: 0% GST

#### **D. Payment Settings** (Admin only)
- **Payment Methods**: Cash, card, online
- **Payment Processing**: Gateway configuration
- **Refund Policies**: Return and refund rules

#### **E. POS Settings** (Admin only)
- **Invoice Sequence**: Bill number format
- **Receipt Settings**: Receipt template
- **Print Settings**: Printer configuration

#### **F. Staff Directory** (Admin only)
- **User Management**: Add/edit staff
- **Role Permissions**: Access control
- **Commission Settings**: Staff incentives

### **Demo Steps**:
1. **Access Settings**:
   - Go to Settings page
   - Browse different categories
   - Check role-based access

2. **Configure Tax Settings**:
   - Click "Tax Settings"
   - Set service tax rate (5%)
   - Configure product tax categories
   - Save settings

3. **Update Business Info**:
   - Click "Business Settings"
   - Update company information
   - Upload logo
   - Save changes

---

## 🧾 Receipt Management

### **Navigation**: `Receipt` → `[Bill Number]`

### **Features**:

#### **A. Receipt Viewing**
- **Receipt Details**: Complete transaction info
- **Itemized Bill**: Services and products
- **Tax Breakdown**: Detailed GST calculation
- **Payment Summary**: Payment methods used

#### **B. Receipt Actions**
- **Print Receipt**: Standard A4 printing
- **Thermal Print**: 80mm thermal printer
- **Download PDF**: Save as PDF file
- **Email Receipt**: Send to client
- **Share Receipt**: Share via link

#### **C. Receipt Formats**
- **Standard Receipt**: A4 format with detailed breakdown
- **Thermal Receipt**: 80mm format optimized for thermal printers
- **Email Receipt**: HTML format for email

### **Demo Steps**:
1. **View Receipt**:
   - Go to any completed sale
   - Click on receipt number
   - View detailed receipt

2. **Print Receipt**:
   - Click "Print" button
   - Choose printer
   - Print receipt

3. **Thermal Print**:
   - Click "Thermal Print" button
   - Optimized for 80mm paper
   - Print on thermal printer

---

## 💵 Cash Registry

### **Navigation**: `Cash Registry`

### **Features**:

#### **A. Daily Cash Management**
- **Opening Balance**: Start of day cash
- **Cash In**: Cash received
- **Cash Out**: Cash paid out
- **Closing Balance**: End of day cash
- **Cash Reconciliation**: Balance verification

#### **B. Transaction Tracking**
- **Cash Sales**: Cash payments received
- **Cash Expenses**: Cash payments made
- **Petty Cash**: Small expenses
- **Cash Deposits**: Bank deposits

#### **C. Reports**
- **Daily Summary**: Day's cash flow
- **Cash Flow Report**: Cash movement trends
- **Reconciliation Report**: Balance verification

### **Demo Steps**:
1. **Open Cash Registry**:
   - Go to Cash Registry page
   - Set opening balance
   - Start day

2. **Track Transactions**:
   - Record cash sales
   - Log cash expenses
   - Monitor cash flow

3. **Close Day**:
   - Calculate closing balance
   - Reconcile cash
   - Generate report

---

## 🎯 Key Features Summary

### **✨ Core Features**:
1. **Appointment Management**: Complete booking system
2. **Quick Sale & Billing**: POS with GST calculation
3. **Client Management**: Customer database
4. **Service Management**: Service catalog
5. **Product & Inventory**: Stock management
6. **Staff Management**: User roles and permissions
7. **Reports & Analytics**: Business insights
8. **Settings & Configuration**: System customization

### **🔧 Advanced Features**:
1. **GST Tax System**: Automatic tax calculation
2. **Thermal Printing**: 80mm receipt printing
3. **Inventory Logs**: Stock movement tracking
4. **Role-based Access**: Security and permissions
5. **Receipt Management**: Multiple receipt formats
6. **Cash Registry**: Daily cash management

### **📱 User Experience**:
1. **Responsive Design**: Works on all devices
2. **Intuitive Interface**: Easy navigation
3. **Real-time Updates**: Live data synchronization
4. **Quick Actions**: Fast common tasks
5. **Search & Filter**: Easy data finding

---

## 🚀 Getting Started Demo

### **Quick Demo Flow**:
1. **Login** to the system
2. **View Dashboard** to see overview
3. **Create Appointment** for a client
4. **Process Quick Sale** with services and products
5. **Generate Receipt** and print
6. **Check Reports** for business insights
7. **Configure Settings** as needed

### **Pro Tips**:
- Use the search functionality to quickly find clients, services, or products
- Take advantage of bulk actions for managing multiple items
- Regularly check inventory logs to monitor stock levels
- Use the thermal print option for faster receipt printing
- Configure tax settings according to your business needs

---

*This demo guide covers all major features of the EaseMySalon system. Each section provides step-by-step instructions for using the features effectively.*
