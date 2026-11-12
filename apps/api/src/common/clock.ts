import { Global, Injectable, Module } from "@nestjs/common";

// The only source of "now" and of delays for business rules, so tests can
// inject a fake and move time (lockout windows, session expiry) without sleeping.
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
