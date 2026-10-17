const EMAIL_PATTERN = /^[A-Z0-9](?:[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[A-Z0-9])?@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i;

export const getEmailValidationError = (email) => {
  const value = String(email || "").trim();
  if (!value) return "Email is required.";
  if (value.length > 254 || !EMAIL_PATTERN.test(value) || value.includes("..")) return "Enter a valid email address, such as name@gmail.com.";
  return "";
};

export const getPasswordValidationError = (password) => {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(value)) return "Password must include an uppercase letter.";
  if (!/[a-z]/.test(value)) return "Password must include a lowercase letter.";
  if (!/[0-9]/.test(value)) return "Password must include a number.";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include a special character, such as ! or @.";
  return "";
};
