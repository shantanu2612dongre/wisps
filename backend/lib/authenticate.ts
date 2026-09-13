import jwt from "jsonwebtoken";

export function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) throw new Error("Missing token");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      phone: string;
    };
    return decoded;
  } catch {
    throw new Error("Invalid or expired token");
  }
}
