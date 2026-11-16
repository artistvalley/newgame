import nodemailer from 'nodemailer';
export async function sendCode(email:string, code:string, purpose:'REGISTER'|'LOGIN'|'PASSWORD_RESET') {
 const host=process.env.SMTP_HOST, user=process.env.SMTP_USER, pass=process.env.SMTP_PASS;
 if(!host || !user || !pass) throw new Error('EMAIL_NOT_CONFIGURED: Configure SMTP_HOST, SMTP_USER and SMTP_PASS before sending verification codes.');
 const transporter=nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user,pass}});
 const label=purpose==='REGISTER'?'verify your email':purpose==='LOGIN'?'sign in':'reset your password';
 await transporter.sendMail({from:process.env.SMTP_FROM||user,to:email,subject:`Your WORLD WAR COMMAND verification code`,text:`Your code to ${label} is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,html:`<div style="font-family:Arial;background:#071629;color:#fff;padding:32px;border-radius:16px"><h1 style="color:#f5c85b">WORLD WAR COMMAND</h1><p>Your code to ${label} is:</p><div style="font-size:34px;letter-spacing:10px;font-weight:bold;padding:20px;background:#102746;border-radius:12px">${code}</div><p>This code expires in 10 minutes.</p></div>`});
}
