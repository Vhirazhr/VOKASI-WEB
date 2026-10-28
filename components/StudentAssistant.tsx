'use client';

import {useEffect,useRef,useState} from 'react';
import {Send} from 'lucide-react';
import {CHATBOT_GREETING,CHATBOT_SUGGESTIONS,getVokasiChatbotReply} from '@/lib/vokasi-chatbot';

type Message={who:'assistant'|'student';body:string};

export default function StudentAssistant({isOpen}:{isOpen:boolean}){
  const [input,setInput]=useState('');
  const [messages,setMessages]=useState<Message[]>([{who:'assistant',body:CHATBOT_GREETING}]);
  const feedRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(isOpen){
      inputRef.current?.focus();
      if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;
    }
  },[isOpen]);

  useEffect(()=>{
    if(isOpen&&feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;
  },[messages,isOpen]);

  function sendMessage(raw:string){
    const question=raw.trim().slice(0,250);
    if(!question)return;
    const reply=getVokasiChatbotReply(question);
    setMessages(old=>[
      ...old,
      {who:'student' as const,body:question},
      {who:'assistant' as const,body:reply.text}
    ].slice(-40));
    setInput('');
    inputRef.current?.focus();
  }

  return <section className="vokasi-chatbot-conversation" aria-label="Percakapan chatbot VOKASI">
    <div className="vokasi-assistant-feed" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Pesan chatbot" ref={feedRef}>
      {messages.map((message,index)=><article key={index} className={'vokasi-assistant-message '+message.who}>
        {message.who==='assistant'&&<small>CHATBOT VOKASI</small>}
        <p>{message.body}</p>
      </article>)}
    </div>
    <div className="vokasi-assistant-prompts" aria-label="Pertanyaan cepat">
      {CHATBOT_SUGGESTIONS.map(prompt=><button type="button" key={prompt} onClick={()=>sendMessage(prompt)}>{prompt}</button>)}
    </div>
    <form className="vokasi-assistant-composer" onSubmit={event=>{event.preventDefault();sendMessage(input);}}>
      <input ref={inputRef} autoComplete="off" value={input} onChange={event=>setInput(event.target.value.slice(0,250))} maxLength={250} aria-label="Tulis pesan untuk chatbot" placeholder="Tulis pertanyaanmu di sini..." />
      <button type="submit" disabled={!input.trim()} aria-label="Kirim pesan"><Send size={19}/></button>
    </form>
  </section>;
}
