import { ExecutionEvent } from "./ExecutionEvent";
import { ExecutionEventRepository } from "./ExecutionEventRepository";
import crypto from "crypto";

export class EventEmitter {
    private static instance: EventEmitter;
    private repository: ExecutionEventRepository;

    private constructor() {
        this.repository = new ExecutionEventRepository();
    }

    public static getInstance(): EventEmitter {
        if (!EventEmitter.instance) {
            EventEmitter.instance = new EventEmitter();
        }
        return EventEmitter.instance;
    }

    public emit(event: Omit<ExecutionEvent, "id" | "timestamp">): void {
        try {
            const fullEvent: ExecutionEvent = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                ...event
            };
            this.repository.create(fullEvent);
        } catch (error) {
            console.warn("[OBSERVABILITY] Failed to persist execution event:", error);
        }
    }
}

export const eventEmitter = EventEmitter.getInstance();
