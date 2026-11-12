// Lookup keys: " An@Mail.COM " and "an@mail.com" are the same login.
export const toEmailKey = (email: string) => email.trim().toLowerCase();

export const toUsernameKey = (username: string) =>
  username.trim().toLowerCase();
