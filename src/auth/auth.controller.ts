import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, type JwtPayload, Public } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './login.dto.js';

// Counts attempts per IP *and* username: every till in a store shares one
// public IP, so a per-IP limit alone would lock out the whole shift.
// ponytail: counters live in this process's memory; move them to a shared
// store (e.g. Redis) if the API ever runs as more than one instance.
@Injectable()
class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: {
    ip?: string;
    body?: { username?: unknown };
  }) {
    return Promise.resolve(`${req.ip}:${String(req.body?.username)}`);
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  login(@Body() { username, password }: LoginDto) {
    return this.auth.login(username, password);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
