import { NextResponse } from 'next/server';
export function errorResponse(error:unknown){const message=error instanceof Error?error.message:'Unexpected server error';const status=message==='UNAUTHENTICATED'?401:message.startsWith('EMAIL_NOT_CONFIGURED')?503:message.includes('Unique constraint')?409:400;return NextResponse.json({error:message.replace(/^EMAIL_NOT_CONFIGURED: /,'')},{status});}
export const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,(_k,v)=>typeof v==='bigint'?Number(v):v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
