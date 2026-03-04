# Multi-Staff Assignment Feature

## Overview

The Multi-Staff Assignment feature allows a single service to be performed by multiple staff members, with proper accounting of each staff member's contribution. This is essential for services that require multiple people (like hair coloring, spa treatments, etc.) and enables accurate commission calculations and staff performance tracking.

## Features

### 👥 **Multiple Staff Per Service**
- Assign multiple staff members to a single service
- Automatic equal distribution of service contribution
- Visual indication of staff assignments
- Easy addition and removal of staff members

### 📊 **Contribution Tracking**
- Each staff member's percentage contribution is tracked
- Automatic calculation of individual earnings
- Support for future commission calculations
- Detailed staff performance analytics

### 🎯 **Smart UI Design**
- Compact dropdown interface that doesn't consume excessive space
- "Add Staff" button for easy staff addition
- Visual staff cards showing assigned members
- Real-time percentage distribution display

### 🔄 **Backward Compatibility**
- Maintains compatibility with single-staff assignments
- Seamless migration from existing data
- Legacy support for existing appointments and sales

## How It Works

### 1. **Staff Selection Process**
```
1. User selects first staff member from dropdown
2. Clicks "Add Staff" to add more staff
3. Additional dropdown appears for more staff selection
4. Selected staff are displayed as compact cards
5. System automatically calculates equal percentages
```

### 2. **Data Structure**
```typescript
interface StaffContribution {
  staffId: string
  staffName: string
  percentage: number  // 0-100
  amount: number      // Calculated based on percentage
}

interface ServiceItem {
  // ... existing fields
  staffContributions?: StaffContribution[]  // New multi-staff support
  staffId?: string                          // Legacy single-staff support
  staffName?: string                        // Legacy single-staff support
}
```

### 3. **Backend Processing**
- **Sales API**: Processes `staffContributions` array
- **Appointments API**: Handles `staffAssignments` with validation
- **Receipts API**: Maintains staff contribution data
- **Validation**: Ensures percentages sum to 100%

## Technical Implementation

### **Frontend Components**

#### `MultiStaffSelector` Component
- **Location**: `components/ui/multi-staff-selector.tsx`
- **Purpose**: Handles multi-staff selection UI
- **Features**:
  - Compact dropdown design (256px width)
  - "Add Staff" functionality
  - Selected staff display cards
  - Automatic percentage calculation
  - Real-time validation

#### `QuickSale` Integration
- **Location**: `components/appointments/quick-sale.tsx`
- **Integration**: Replaces single staff selector
- **Grid Layout**: Adjusted to accommodate 256px dropdown
- **Data Flow**: Maps staff contributions to backend format

### **Backend Models**

#### `Sale` Model Updates
```javascript
const staffContributionSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  staffName: { type: String, required: true },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

// Added to itemSchema
staffContributions: [staffContributionSchema]
```

#### `Appointment` Model Updates
```javascript
staffAssignments: [{
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  role: { type: String, default: 'primary' }
}]
```

#### `Receipt` Model Updates
- Similar `staffContributions` array structure
- Maintains legacy `staffId` and `staffName` fields
- Full backward compatibility

### **API Endpoints**

#### Sales API (`/api/sales`)
```javascript
// Processes staffContributions
if (item.staffContributions) {
  item.staffContributions.forEach(contribution => {
    contribution.amount = (item.total * contribution.percentage) / 100
  })
}
```

#### Appointments API (`/api/appointments`)
```javascript
// Validates staffAssignments percentages
const totalPercentage = service.staffAssignments.reduce((sum, assignment) => 
  sum + assignment.percentage, 0
)
if (totalPercentage !== 100) {
  return res.status(400).json({ error: 'Staff assignments must sum to 100%' })
}
```

## User Interface

### **Staff Selection Flow**

1. **Initial Selection**
   - Single dropdown for first staff member
   - Compact 256px width design
   - Clear placeholder text

2. **Adding More Staff**
   - "Add Staff" button next to dropdown
   - Additional dropdown appears below
   - Only shows available (unselected) staff

3. **Selected Staff Display**
   - Green cards showing assigned staff
   - Staff name, role, and percentage
   - Remove button (X) for each staff member
   - Only visible when multiple staff assigned

4. **Multi-Staff Information**
   - Blue info bar showing "Equally distributed among X staff"
   - Only appears when multiple staff assigned
   - Clear visual feedback

### **Visual Design**

- **Colors**: Green for assigned staff, blue for info
- **Icons**: Clock for time, Users for multi-staff
- **Layout**: Compact, space-efficient design
- **Responsive**: Adapts to different screen sizes

## Configuration

### **Grid Layout Adjustments**
```typescript
// Updated grid columns to accommodate 256px dropdown
grid-cols-[2fr_3fr_120px_100px_100px_100px_40px]
// Service | Staff | Qty | Price | Discount | Total | Delete
```

### **Dropdown Width**
```typescript
// Consistent 256px width across all elements
className="w-64"  // 256px = 16rem
```

## Benefits

### **For Business**
- **Accurate Accounting**: Proper tracking of staff contributions
- **Commission Calculations**: Easy calculation of individual earnings
- **Performance Analytics**: Detailed staff performance metrics
- **Service Flexibility**: Support for complex multi-person services

### **For Staff**
- **Fair Distribution**: Equal percentage distribution
- **Clear Attribution**: Each staff member's contribution is tracked
- **Performance Tracking**: Individual performance metrics
- **Commission Transparency**: Clear earnings calculation

### **For Management**
- **Detailed Reports**: Comprehensive staff performance reports
- **Service Analytics**: Understanding of service complexity
- **Staff Utilization**: Tracking of staff workload distribution
- **Revenue Attribution**: Accurate revenue per staff member

## Future Enhancements

### **Planned Features**
- **Custom Percentages**: Allow manual percentage input
- **Role-Based Distribution**: Different percentages based on roles
- **Service Templates**: Pre-configured staff assignments
- **Commission Integration**: Direct commission calculations
- **Performance Dashboards**: Staff performance analytics

### **Advanced Features**
- **Skill-Based Assignment**: Assign based on staff skills
- **Workload Balancing**: Automatic workload distribution
- **Time Tracking**: Track time spent by each staff member
- **Quality Ratings**: Rate individual staff contributions

## Testing

### **Test Scenarios**
1. **Single Staff Assignment**: Verify backward compatibility
2. **Multiple Staff Assignment**: Test equal distribution
3. **Staff Addition/Removal**: Test dynamic staff management
4. **Percentage Validation**: Ensure percentages sum to 100%
5. **Data Persistence**: Verify data is saved correctly
6. **UI Responsiveness**: Test on different screen sizes

### **Validation Rules**
- Staff assignments must sum to 100%
- At least one staff member must be assigned
- Staff cannot be assigned twice to the same service
- All staff must be active and available

## Files Modified

### **Frontend**
- `components/ui/multi-staff-selector.tsx` - Main multi-staff component
- `components/appointments/quick-sale.tsx` - Integration with quick sale
- Grid layout adjustments for proper alignment

### **Backend**
- `backend/models/Sale.js` - Added staffContributions schema
- `backend/models/Appointment.js` - Added staffAssignments schema
- `backend/models/Receipt.js` - Added staffContributions support
- `backend/server.js` - Updated API endpoints for multi-staff processing

### **Data Migration**
- Existing single-staff data remains compatible
- New multi-staff data uses enhanced schema
- Seamless transition without data loss

This feature significantly enhances the EaseMySalon's capability to handle complex services while maintaining data integrity and providing clear staff attribution for better business management.
