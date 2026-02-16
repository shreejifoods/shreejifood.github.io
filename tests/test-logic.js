const { isDayAvailable, getAvailableOrderDays } = require('../assets/js/order-logic.js');

// Helper to create a date object for a specific day/time
function createMockDate(dayIndex, hour) {
    // 2023-01-01 was a Sunday. So:
    // Jan 2 = Mon, Jan 3 = Tue, Jan 4 = Wed, Jan 5 = Thu, Jan 6 = Fri
    const d = new Date(2023, 0, 1 + dayIndex); // Month is 0-indexed
    d.setHours(hour, 0, 0, 0);
    return d;
}

console.log("=== Running Order Logic Tests ===");

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        failed++;
    }
}

// --- Test Suite ---

// Scenario 1: It's Monday 10:00 AM
// Should be able to order for Mon, Tue, Wed, Thu, Fri
const mondayMorning = createMockDate(1, 10); // Monday
let days = getAvailableOrderDays(mondayMorning);
assert(days.includes("Monday"), "Monday morning: Monday should be available");
assert(days.includes("Friday"), "Monday morning: Friday should be available");
assert(days.length === 5, `Monday morning: Should satisfy 5 days, got ${days.length}`);

// Scenario 2: It's Monday 3:00 PM (15:00)
// Should NOT be able to order for Mon. Only Tue, Wed, Thu, Fri.
const mondayAfternoon = createMockDate(1, 15);
days = getAvailableOrderDays(mondayAfternoon);
assert(!days.includes("Monday"), "Monday afternoon: Monday should NOT be available");
assert(days.includes("Tuesday"), "Monday afternoon: Tuesday should be available");
assert(days.length === 4, `Monday afternoon: Should satisfy 4 days, got ${days.length}`);

// Scenario 3: It's Wednesday 1:00 PM (13:00)
// Should be able to order for Wed, Thu, Fri. (Mon, Tue passed)
const wednesdayMorning = createMockDate(3, 13);
days = getAvailableOrderDays(wednesdayMorning);
assert(days.includes("Wednesday"), "Wednesday morning: Wednesday should be available");
assert(!days.includes("Tuesday"), "Wednesday morning: Tuesday should NOT be available (past)");
assert(days.length === 3, `Wednesday morning: Should satisfy 3 days, got ${days.length}`);

// Scenario 4: It's Friday 4:00 PM (16:00)
// Should be able to order nothing for the current week (or maybe next week logic, but for now empty)
const fridayAfternoon = createMockDate(5, 16);
days = getAvailableOrderDays(fridayAfternoon);
assert(days.length === 0, `Friday afternoon: Should have 0 days available this week, got ${days.length}`);

// Scenario 5: It's Sunday 
// Should assume next week starts? Or everything closed?
// Current logic looks at "Current Week". If today is Sunday (0), Mon-Fri are "Future" relative to index 0.
// So Sunday should create availability for Mon-Fri of the upcoming week.
const sunday = createMockDate(7, 10); // Jan 8 2023 (Sunday)
const sundayDayIndex = sunday.getDay(); // confirm it is 0
if (sundayDayIndex === 0) {
    days = getAvailableOrderDays(sunday);
    // Since Sun=0, and Mon=1...Fri=5, all are > 0.
    assert(days.includes("Monday"), "Sunday: Monday should be available");
    assert(days.length === 5, `Sunday: Should have 5 days available, got ${days.length}`);
} else {
    console.warn("Skipping Sunday test - check mock date logic");
}

console.log(`\nTests Completed. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
