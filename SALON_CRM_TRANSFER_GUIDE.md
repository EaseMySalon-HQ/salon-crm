# EaseMySalon Transfer Guide

## Overview
This guide will help you transfer your EaseMySalon from your current MacBook to a new MacBook with all data and settings intact.

## What's Included in the Transfer
- **Frontend**: Next.js application with all components and UI
- **Backend**: Node.js/Express API server
- **Database**: MongoDB with all your data (clients, appointments, sales, products, etc.)
- **Configuration**: All environment settings and business configurations
- **Dependencies**: All required packages and libraries

## Data Backup Status ✅
Your data has been successfully backed up:
- **Database**: 8 appointments, 6 users, 8 clients, 37 sales, 4 products, 4 services, 1 staff member
- **Business Settings**: Complete configuration including business details, tax settings, etc.
- **Cash Registry**: 4 cash registry entries
- **Inventory**: 5 inventory transactions

## Step-by-Step Transfer Process

### Phase 1: Prepare the New MacBook

#### 1. Install Required Software
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (LTS version)
brew install node

# Install MongoDB Community Edition
brew tap mongodb/brew
brew install mongodb-community

# Install Git (if not already installed)
brew install git
```

#### 2. Start MongoDB Service
```bash
# Start MongoDB service
brew services start mongodb/brew/mongodb-community

# Verify MongoDB is running
brew services list | grep mongodb
```

### Phase 2: Transfer the Application

#### 1. Copy the Project Files
You have several options:

**Option A: Using External Drive/USB**
1. Copy the entire `/Users/shubhamanand/ease-my-salon` folder to an external drive
2. Transfer to new MacBook and place in the same location

**Option B: Using Cloud Storage (Recommended)**
1. Compress the project folder:
```bash
cd /Users/shubhamanand/ease-my-salon
tar -czf ease-my-salon-backup.tar.gz --exclude=node_modules --exclude=.next --exclude=backend/node_modules .
```

2. Upload to iCloud, Google Drive, or Dropbox
3. Download on new MacBook

**Option C: Using Git (If you have a repository)**
1. Push current changes to GitHub/GitLab
2. Clone on new MacBook

#### 2. Extract and Setup on New MacBook
```bash
# Navigate to your home directory
cd ~

# Extract the backup (if using compressed file)
tar -xzf ease-my-salon-backup.tar.gz

# Rename to ease-my-salon
mv ease-my-salon-backup ease-my-salon

# Navigate to project directory
cd ease-my-salon
```

### Phase 3: Restore Database

#### 1. Restore MongoDB Data
```bash
# Navigate to project directory
cd /Users/shubhamanand/ease-my-salon

# Restore the database
mongorestore --db ease-my-salon backup/ease-my-salon/

# Verify data restoration
mongosh ease-my-salon --eval "db.stats()"
```

#### 2. Verify Data Integrity
```bash
# Check collections and document counts
mongosh ease-my-salon --eval "
  print('Collections:');
  db.getCollectionNames().forEach(name => {
    print(name + ': ' + db[name].countDocuments() + ' documents');
  });
"
```

### Phase 4: Install Dependencies

#### 1. Install Frontend Dependencies
```bash
# Navigate to project root
cd /Users/shubhamanand/ease-my-salon

# Install frontend dependencies
npm install
# or if you prefer pnpm
pnpm install
```

#### 2. Install Backend Dependencies
```bash
# Navigate to backend directory
cd backend

# Install backend dependencies
npm install

# Return to project root
cd ..
```

### Phase 5: Environment Configuration

#### 1. Create Environment Files
```bash
# Create frontend environment file
cp env.example .env.local

# Create backend environment file
cp backend/env.example backend/.env
```

#### 2. Update Configuration (if needed)
The default configuration should work, but verify these files:

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_ENVIRONMENT=development
```

**Backend (.env):**
```
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
MONGODB_URI=mongodb://localhost:27017/ease-my-salon
```

### Phase 6: Start the Application

#### 1. Start Backend Server
```bash
# Navigate to backend directory
cd backend

# Start the backend server
npm run dev
# or
npm start
```

#### 2. Start Frontend (in a new terminal)
```bash
# Navigate to project root
cd /Users/shubhamanand/ease-my-salon

# Start the frontend development server
npm run dev
```

#### 3. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Phase 7: Verification

#### 1. Test Login
- Try logging in with your existing admin credentials
- Verify all user accounts are accessible

#### 2. Check Data Integrity
- Navigate through all sections (Clients, Appointments, Sales, etc.)
- Verify all your data is present and correct
- Test creating new records

#### 3. Test Key Features
- Create a new appointment
- Process a quick sale
- Generate a receipt
- Check reports and analytics

## Troubleshooting

### Common Issues and Solutions

#### 1. MongoDB Connection Issues
```bash
# Check if MongoDB is running
brew services list | grep mongodb

# Start MongoDB if not running
brew services start mongodb/brew/mongodb-community

# Check MongoDB logs
tail -f /opt/homebrew/var/log/mongodb/mongo.log
```

#### 2. Port Already in Use
```bash
# Check what's using port 3000 or 3001
lsof -i :3000
lsof -i :3001

# Kill processes if needed
kill -9 <PID>
```

#### 3. Node Modules Issues
```bash
# Clear node modules and reinstall
rm -rf node_modules backend/node_modules
npm install
cd backend && npm install
```

#### 4. Database Permission Issues
```bash
# Check MongoDB permissions
mongosh ease-my-salon --eval "db.runCommand({connectionStatus: 1})"
```

## Data Backup Locations

Your data is backed up in:
- **MongoDB Dump**: `/Users/shubhamanand/ease-my-salon/backup/ease-my-salon/`
- **Full Project Backup**: `/Users/shubhamanand/ease-my-salon-backup-[timestamp]/`

## Security Notes

1. **Change JWT Secret**: Update the JWT_SECRET in backend/.env for security
2. **Update Passwords**: Consider updating admin passwords after transfer
3. **Environment Variables**: Never commit .env files to version control

## Post-Transfer Checklist

- [ ] MongoDB is running and accessible
- [ ] All collections have correct document counts
- [ ] Frontend loads without errors
- [ ] Backend API responds correctly
- [ ] Login functionality works
- [ ] All data is visible and correct
- [ ] New records can be created
- [ ] Reports and analytics work
- [ ] Receipt generation works
- [ ] All user roles and permissions work

## Support

If you encounter any issues during the transfer:
1. Check the troubleshooting section above
2. Verify all services are running
3. Check the console logs for error messages
4. Ensure all environment variables are set correctly

## Next Steps

After successful transfer:
1. Update any hardcoded paths if needed
2. Configure your IDE/editor for the new location
3. Set up any additional development tools
4. Consider setting up automated backups
5. Update any documentation with new paths

---

**Transfer completed successfully!** 🎉

Your EaseMySalon should now be running on your new MacBook with all data and settings intact.
