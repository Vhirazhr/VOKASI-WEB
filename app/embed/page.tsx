import {redirect} from 'next/navigation';
/** URL khusus untuk memasang VOKASI di iframe pada website sekolah. */
export default function Embed(){redirect('/login?embed=1');}
