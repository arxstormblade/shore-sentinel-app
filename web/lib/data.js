export const navItems=[{href:'/inventory',label:'Inventory',icon:'▤'},{href:'/scans-reports',label:'Scans & Reports',icon:'◎'},{href:'/remediation',label:'Remediation',icon:'✓'}];
export const apiBase=process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL||process.env.NEXT_PUBLIC_API_URL||'/shore-sentinel-api';
export const machines=[];
export const audits=[];
export const reports=[];
export const remediations=[];
export const byId=(items,id)=>items.find(x=>x.id===id);
