import type { DomainEvent } from "../core/types.js";
import { randomUUID } from "node:crypto";
export class InMemoryEventStore {
  #streams=new Map<string,DomainEvent[]>();
  append<T>(streamId:string, expectedVersion:number, input:Omit<DomainEvent<T>,"eventId"|"streamId"|"streamVersion"|"recordedAt">):DomainEvent<T>{
    const xs=this.#streams.get(streamId)??[];
    if(xs.length!==expectedVersion) throw new Error(`WRONG_EXPECTED_VERSION:${expectedVersion}:${xs.length}`);
    const event={...input,eventId:randomUUID(),streamVersion:xs.length+1,recordedAt:new Date().toISOString()} as DomainEvent<T>;
    this.#streams.set(streamId,[...xs,event]); return event;
  }
  read(streamId:string):DomainEvent[]{ return [...(this.#streams.get(streamId)??[])]; }
  all():DomainEvent[]{ return [...this.#streams.values()].flat(); }
}
