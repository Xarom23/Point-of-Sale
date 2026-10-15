import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type JwtPayload, Public } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
