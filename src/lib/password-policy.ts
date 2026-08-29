import { z } from "zod";

/**
 * Standard enterprise password policy:
 * - Minimum 8 characters
 * - Maximum 200 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit or special character
 */
export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W_]).{8,200}$/;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(200, "Password cannot exceed 200 characters")
  .regex(
    passwordRegex,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number or special character."
  );

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: "Password must be at least 8 characters long." };
  }
  if (password.length > 200) {
    return { valid: false, reason: "Password cannot exceed 200 characters." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one lowercase letter." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one uppercase letter." };
  }
  if (!/[\d\W_]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one number or special character." };
  }
  return { valid: true };
}
