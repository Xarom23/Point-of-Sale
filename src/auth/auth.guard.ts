import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Role, User } from '../users/user.entity.js';

export interface JwtPayload {
  sub: number;
  username: string;
  role: Role;
}

type AuthRequest = Request & { user?: JwtPayload };

const IS_PUBLIC = 'isPublic';
const ROLES = 'roles';

/** Skips authentication for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route or controller to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Injects the authenticated user's JWT payload. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthRequest>().user,
);

// The token proves identity; the users table decides whether that user may
// still act and with which role, so deactivation and demotion apply at once.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.users.findOneBy({ id: payload.sub, active: true });
    if (!user) throw new UnauthorizedException();
    req.user = { ...payload, username: user.username, role: user.role };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
