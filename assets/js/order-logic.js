/**
 * Handles menu availability logic based on current day and time.
 * Rules:
 * - Orders for TODAY must be placed before 2:00 PM (14:00).
 * - After 2:00 PM, TODAY is unavailable.
 * - Future days (up to Friday) are available.
 * - Weekends are typically closed (handled by simply not showing them or marking closed).
 */

const ORDER_CUTOFF_HOUR = 13; // 1 PM (matches advertised "Order by 1pm")
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Validates if a given day is available for ordering based on current global time.
 * @param {string} targetDayName - e.g., "Monday"
 * @param {Date} [mockCurrentDate] - Optional for testing
 * @returns {boolean}
 */
function isDayAvailable(targetDayName, mockCurrentDate = new Date()) {
    const currentDayIndex = mockCurrentDate.getDay(); // 0 (Sun) - 6 (Sat)
    const currentHour = mockCurrentDate.getHours();

    const targetDayIndex = DAYS_OF_WEEK.indexOf(targetDayName);

    if (targetDayIndex === -1) return false; // Invalid day

    // If target day is in the past relative to current weekday index
    // Note: This simple logic assumes we are only looking at the CURRENT week (Mon-Fri).
    // If today is Friday, and user wants next Monday, that's a different scope.
    // For this MVP, we assume "Weekly Menu" resets or we look at standard week cycle.

    // Case 1: Target day is today
    if (currentDayIndex === targetDayIndex) {
        return currentHour < ORDER_CUTOFF_HOUR;
    }

    // Case 2: Target day is in the future (within this week)
    if (targetDayIndex > currentDayIndex) {
        return true;
    }

    // Case 3: Target day is in the past (e.g. Today is Wed, Target is Mon) -> Not available for this week
    return false;
}

/**
 * Gets a list of available days for the current user session.
 * @param {Date} [mockCurrentDate]
 * @returns {string[]} Array of available day names
 */
function getAvailableOrderDays(mockCurrentDate = new Date()) {
    const availableDays = [];
    // Only check Mon-Fri
    for (let i = 1; i <= 5; i++) {
        const dayName = DAYS_OF_WEEK[i];
        if (isDayAvailable(dayName, mockCurrentDate)) {
            availableDays.push(dayName);
        }
    }
    return availableDays;
}

// Export for Node.js testing environment, or global for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isDayAvailable, getAvailableOrderDays, ORDER_CUTOFF_HOUR };
} else {
    window.MenuLogic = {
        isDayAvailable,
        getAvailableOrderDays,
        ORDER_CUTOFF_HOUR
    };
}
