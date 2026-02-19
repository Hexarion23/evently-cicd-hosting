import jwt from "jsonwebtoken";
import createError from "http-errors";
import * as messengerModel from "../models/messenger.model.js";

const JWT_SECRET = process.env.JWT_SECRET;

function getAuth(req) {
  const token = req.cookies?.token;
  if (!token) throw createError(401, "Not authenticated");
  try {
    return jwt.verify(token, JWT_SECRET); // { id, ... }
  } catch {
    throw createError(401, "Invalid token");
  }
}

export default async function requireNotSuspended(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    const s = await messengerModel.getActiveSuspension(myId);
    if (!s) return next();

    // block sending
    const until = s.end_at ? new Date(s.end_at).toLocaleString() : "unknown time";
    return next(createError(403, `Suspended until ${until}`));
  } catch (err) {
    next(err);
  }
}
