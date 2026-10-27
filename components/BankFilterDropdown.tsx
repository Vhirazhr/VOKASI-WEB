'use client';

import {useEffect,useId,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';

export type BankFilterItem={
 value:string;
 label:string;
 note?:string;
 count?:number;
};

export default function BankFilterDropdown({
 label,value,items,onChange
}:{
 label:string;
 value:string;
 items:BankFilterItem[];
 onChange:(next:string)=>void;
}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const choices=useRef<Array<HTMLButtonElement|null>>([]);
 const menuId=useId();
 const selectedIndex=Math.max(0,items.findIndex(item=>item.value===value));
 const active=items[selectedIndex];

 useEffect(()=>{
  if(!open)return;
  // Keep selection keyboard-accessible while rendering a fully styled menu.
  choices.current[selectedIndex]?.focus();
  function closeOnOutsideClick(e:PointerEvent){
   if(!root.current?.contains(e.target as Node))setOpen(false);
  }
  document.addEventListener('pointerdown',closeOnOutsideClick);
  return ()=>document.removeEventListener('pointerdown',closeOnOutsideClick);
 // Only opening should move focus, not every parent render.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);

 function select(next:string){
  onChange(next);
  setOpen(false);
  trigger.current?.focus();
 }
 function handleKeys(event:KeyboardEvent<HTMLDivElement>){
  if(event.key==='Escape'&&open){
   event.preventDefault();setOpen(false);trigger.current?.focus();return;
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();
  if(!open){setOpen(true);return;}
  const current=choices.current.indexOf(document.activeElement as HTMLButtonElement);
  const pos=current<0?selectedIndex:current;
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:
   (pos+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  choices.current[next]?.focus();
 }

 return <div className={'bank-filter-dropdown'+(open?' is-open':'')} ref={root} onKeyDown={handleKeys}>
  <span className="bank-filter-label">{label}</span>
  <button ref={trigger} type="button" className="bank-filter-trigger"
   aria-label={label+': '+active.label} aria-haspopup="listbox"
   aria-controls={open?menuId:undefined} aria-expanded={open}
   onClick={()=>setOpen(current=>!current)}>
   <span className="bank-filter-selected">{active.label}</span>
   <ChevronDown size={17} aria-hidden="true"/>
  </button>
  {open&&<div id={menuId} role="listbox" aria-label={'Pilih '+label.toLowerCase()} className="bank-filter-options">
   {items.map((item,i)=><button
    key={item.value||'all'} ref={node=>{choices.current[i]=node;}}
    role="option" aria-selected={item.value===value} type="button"
    className={'bank-filter-option'+(item.value===value?' selected':'')}
    onClick={()=>select(item.value)}>
    <span className="bank-filter-option-main">
     <span className="bank-filter-option-label">{item.label}</span>
     {item.note&&<small>{item.note}</small>}
    </span>
    {typeof item.count==='number'&&<span className="bank-filter-count">{item.count.toLocaleString('id-ID')}</span>}
    {item.value===value&&<Check size={15} aria-hidden="true" className="bank-filter-check"/>}
   </button>)}
  </div>}
 </div>;
}
