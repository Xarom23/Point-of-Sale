import {
  Injectable,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { Role, User } from '../users/user.entity.js';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Seeds the first admin so a fresh database is usable.
  async onApplicationBootstrap() {
    if (await this.users.count()) return;
    await this.users.save({
      username: this.config.getOrThrow<string>('ADMIN_USERNAME'),
      passwordHash: await hash(
        this.config.getOrThrow<string>('ADMIN_PASSWORD'),
        10,
      ),
      role: Role.Admin,
    });
  }

  async login(username: string, password: string) {
    const user = await this.users.findOne({
      where: { username, active: true },
      select: { id: true, username: true, role: true, passwordHash: true },
    });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { passwordHash: _, ...profile } = user;
    return {
      access_token: await this.jwt.signAsync({
        sub: user.id,
        username: user.username,
        role: user.role,
      }),
      user: profile,
    };
  }
}
