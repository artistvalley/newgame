import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { db } from './db';
const COOKIE = 'wwc_session';
const hash = (v:string) => createHash('sha256').update(v).digest('hex');
export async function createSession(userId:string) {
 const token = randomBytes(32).toString('hex');
 await db.session.create({data:{userId,tokenHash:hash(token),expiresAt:new Date(Date.now()+30*24*60*60*1000)}});
 (await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*24*60*60});
}
export async function getCurrentUser() {
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token) return null;
 const session=await db.session.findUnique({where:{tokenHash:hash(token)},include:{user:{include:{country:{include:{territories:true}}}}}});
 if(!session || session.expiresAt < new Date()) { if(session) await db.session.delete({where:{id:session.id}}); return null; }
 return session.user;
}
export async function destroySession(){
 const token=(await cookies()).get(COOKIE)?.value;
 if(token) await db.session.deleteMany({where:{tokenHash:hash(token)}});
 (await cookies()).delete(COOKIE);
}
export async function requireUser(){ const user=await getCurrentUser(); if(!user) throw new Error('UNAUTHENTICATED'); return user; }
export { hash };
