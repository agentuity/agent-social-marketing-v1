import { addDays, addWeeks, addMonths, isPast, format } from "date-fns";

/**
 * Parse simple natural language relative dates into a Date object.
 * Supports common phrases like "tomorrow", "next week", "in 3 days", etc.
 */
function parseRelativeDate(dateStr: string, now: Date): Date | null {
	const lower = dateStr.trim().toLowerCase();

	if (lower === "tomorrow") return addDays(now, 1);
	if (lower === "today") return now;
	if (lower === "next week") return addWeeks(now, 1);
	if (lower === "next month") return addMonths(now, 1);

	const inDaysMatch = lower.match(/^in\s+(\d+)\s+days?$/);
	if (inDaysMatch) return addDays(now, Number.parseInt(inDaysMatch[1]!, 10));

	const inWeeksMatch = lower.match(/^in\s+(\d+)\s+weeks?$/);
	if (inWeeksMatch) return addWeeks(now, Number.parseInt(inWeeksMatch[1]!, 10));

	const inMonthsMatch = lower.match(/^in\s+(\d+)\s+months?$/);
	if (inMonthsMatch) return addMonths(now, Number.parseInt(inMonthsMatch[1]!, 10));

	return null;
}

/**
 * Parse a date string and ensure it's valid
 * @param dateStr The date string to parse (can be a natural language date or formatted date)
 * @param ensureFuture Whether to ensure the date is in the future (defaults to true)
 * @returns A properly formatted date string for the API (ISO format)
 */
export function getValidDate(dateStr?: string, ensureFuture = true): string {
	// Default to one week from now if no date is provided
	const defaultDate = addDays(new Date(), 7);

	// If no date string is provided, return the default date
	if (!dateStr) {
		return format(defaultDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	}

	try {
		let dateObj: Date;

		// Try natural language first, then fall back to Date constructor
		const relativeResult = parseRelativeDate(dateStr, new Date());
		if (relativeResult) {
			dateObj = relativeResult;
		} else {
			dateObj = new Date(dateStr);
		}

		// Ensure the date is valid
		if (Number.isNaN(dateObj.getTime())) {
			console.warn(`Invalid date: "${dateStr}", using default date`);
			return format(defaultDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
		}

		// If we need to ensure the date is in the future and it's in the past, use the default
		if (ensureFuture && isPast(dateObj)) {
			console.warn(
				`Date is in the past: "${dateStr}", using default future date`,
			);
			return format(defaultDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
		}

		// Format the date for the API
		return format(dateObj, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	} catch (error) {
		// If anything goes wrong, return the default date
		console.error(`Error parsing date "${dateStr}": ${error}`);
		return format(defaultDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	}
}

// Keep getValidFutureDate for backward compatibility
export function getValidFutureDate(dateStr?: string): string {
	return getValidDate(dateStr, true);
}

/**
 * Increment a date string by a specified number of days
 * @param dateStr The date string to increment (ISO format)
 * @param days Number of days to add
 * @returns A new date string in ISO format with the days added
 */
export function incrementDateByDays(dateStr: string, days: number): string {
	try {
		const dateObj = new Date(dateStr);
		if (Number.isNaN(dateObj.getTime())) {
			throw new Error(`Invalid date: "${dateStr}"`);
		}

		const newDate = addDays(dateObj, days);
		return format(newDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	} catch (error) {
		console.error(
			`Error incrementing date "${dateStr}" by ${days} days: ${error}`,
		);
		// Return the original date if there's an error
		return dateStr;
	}
}
