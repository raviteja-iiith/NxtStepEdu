// ============================================================
// UTILITY FUNCTIONS — Pure functions, no framework dependencies
// ============================================================

/**
 * Generate a random alphanumeric password of given length
 * Contains uppercase, lowercase, and digits
 */
export function generateTempPassword(length: number = 8): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed I, O to avoid confusion
  const lower = 'abcdefghjkmnpqrstuvwxyz'; // Removed i, l, o
  const digits = '23456789'; // Removed 0, 1
  const all = upper + lower + digits;

  let password = '';
  // Ensure at least one of each type
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  for (let i = 3; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate a 6-digit numeric PIN for parents
 */
export function generateTempPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a principal username: principal@{school_code}
 */
export function generatePrincipalUsername(schoolCode: string): string {
  return `principal@${schoolCode.toLowerCase()}`;
}

/**
 * Generate a teacher username: {firstname}.{employee_id}@{school_code}
 */
export function generateTeacherUsername(
  firstName: string,
  employeeId: string,
  schoolCode: string
): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  return `${cleanFirst}.${employeeId.toLowerCase()}@${schoolCode.toLowerCase()}`;
}

/**
 * Generate a school code suggestion from school name
 * E.g., "Sri Venkateswara Public School" → "svps"
 */
export function suggestSchoolCode(name: string): string {
  return name
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word[0].toLowerCase())
    .join('')
    .slice(0, 8);
}

/**
 * Generate an admission number: {SCHOOL_CODE}-{YEAR}-{SEQUENCE}
 */
export function generateAdmissionNumber(
  schoolCode: string,
  year: number,
  sequence: number
): string {
  return `${schoolCode.toUpperCase()}-${year}-${String(sequence).padStart(3, '0')}`;
}

/**
 * Generate a receipt number: {SCHOOL_CODE}-{YEAR}-{SEQUENCE}
 */
export function generateReceiptNumber(
  schoolCode: string,
  year: number,
  sequence: number
): string {
  return `${schoolCode.toUpperCase()}-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Format date to Indian format: DD-MMM-YYYY
 */
export function formatDateIndian(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

/**
 * Format currency in Indian Rupees
 */
export function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Calculate attendance percentage
 * Attendance % = (present + late) / total_working_days × 100
 */
export function calculateAttendancePercentage(
  presentDays: number,
  lateDays: number,
  totalWorkingDays: number
): number {
  if (totalWorkingDays === 0) return 0;
  return Math.round(((presentDays + lateDays) / totalWorkingDays) * 100 * 10) / 10;
}

/**
 * Calculate number of days between two dates (inclusive)
 */
export function calculateDaysBetween(from: string, to: string): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Check if a subscription is expiring within N days
 */
export function isSubscriptionExpiring(endDate: string, withinDays: number = 30): boolean {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= withinDays;
}

/**
 * Check if a date is overdue (past due date)
 */
export function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date();
}

/**
 * Get relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateIndian(dateStr);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get initials from a full name (max 2 chars)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');
}

/**
 * Validate Indian phone number (10 digits starting with 6-9)
 */
export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

/**
 * Mask phone number: 98****1234
 */
export function maskPhone(phone: string): string {
  if (phone.length < 10) return phone;
  return phone.slice(0, 2) + '****' + phone.slice(6);
}

/**
 * Get password strength score (0-4)
 */
export function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['#DC2626', '#D97706', '#D97706', '#16A34A', '#16A34A'];

  return {
    score: Math.min(score, 4),
    label: labels[Math.min(score, 4)],
    color: colors[Math.min(score, 4)],
  };
}
