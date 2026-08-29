import { describe, it, expect } from "vitest";
import { passwordSchema, validatePasswordStrength } from "./password-policy";

describe("Password Policy Security Module", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const r = validatePasswordStrength("Ab1!");
    expect(r.valid).toBe(false);
    expect(passwordSchema.safeParse("Ab1!").success).toBe(false);
  });

  it("rejects passwords without uppercase characters", () => {
    const r = validatePasswordStrength("lowercase123!");
    expect(r.valid).toBe(false);
    expect(passwordSchema.safeParse("lowercase123!").success).toBe(false);
  });

  it("rejects passwords without lowercase characters", () => {
    const r = validatePasswordStrength("UPPERCASE123!");
    expect(r.valid).toBe(false);
    expect(passwordSchema.safeParse("UPPERCASE123!").success).toBe(false);
  });

  it("rejects passwords without digits or symbols", () => {
    const r = validatePasswordStrength("LettersOnlyNoDigits");
    expect(r.valid).toBe(false);
    expect(passwordSchema.safeParse("LettersOnlyNoDigits").success).toBe(false);
  });

  it("accepts valid complex passwords with numbers", () => {
    const r = validatePasswordStrength("SecurePass123");
    expect(r.valid).toBe(true);
    expect(passwordSchema.safeParse("SecurePass123").success).toBe(true);
  });

  it("accepts valid complex passwords with special characters", () => {
    const r = validatePasswordStrength("SecurePass!@#");
    expect(r.valid).toBe(true);
    expect(passwordSchema.safeParse("SecurePass!@#").success).toBe(true);
  });
});
