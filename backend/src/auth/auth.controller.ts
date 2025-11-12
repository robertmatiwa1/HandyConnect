import { Body, Controller, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@Request() req: any) {
    return this.authService.getProfile(req.user.id ?? req.user.sub);
  }

  @Get('verify-email/:code')
  verifyEmail(@Param('code') code: string) {
    return this.authService.verifyEmail(code);
  }
}
