const { distributeAppointmentBookedMinutes, sumBookedMinutes } = require('../../lib/branch-utilization');

describe('branch-utilization', () => {
  it('splits duration across assigned staff and tracks unassigned appointments', () => {
    const { bookedByStaff, unassignedMinutes } = distributeAppointmentBookedMinutes([
      { duration: 60, staffId: 'a1' },
      { duration: 90, staffAssignments: [{ staffId: 'a1' }, { staffId: 'a2' }] },
      { duration: 30, staffAssignments: [] },
    ]);

    expect(bookedByStaff.get('a1')).toBe(105);
    expect(bookedByStaff.get('a2')).toBe(45);
    expect(unassignedMinutes).toBe(30);
    expect(sumBookedMinutes(bookedByStaff, unassignedMinutes)).toBe(180);
  });
});
