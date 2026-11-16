import './globals.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'WORLD WAR COMMAND | Build Your Nation',description:'A global strategy and civilization simulation. Create a nation, develop your economy, research, build and shape the world.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
