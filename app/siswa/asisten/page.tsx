import {redirect} from 'next/navigation';

/** Old assistant page bookmarks now open the navbar Chatbot on Beranda. */
export default function AssistantRedirect(){
  redirect('/siswa?chatbot=1');
}
