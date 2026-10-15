import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, type JwtPayload, Roles } from '../auth/auth.guard.js';
import { Role, User } from './user.entity.js';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores anything longer
  password: string;

  @IsEnum(Role)
  role: Role;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get()
  findAll() {
    return this.users.find({ order: { username: 'ASC' } });
  }

  @Post()
  async create(@Body() { password, ...dto }: CreateUserDto) {
    const { id } = await this.users.save(
      this.users.create({ ...dto, passwordHash: await hash(password, 10) }),
    );
    // Re-read so the response can't carry the hash.
    return this.users.findOneByOrFail({ id });
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() { password, ...dto }: UpdateUserDto,
    @CurrentUser() me: JwtPayload,
  ) {
    // Guards against locking every admin out.
    if (
      id === me.sub &&
      (dto.active === false || (dto.role && dto.role !== Role.Admin))
    ) {
      throw new BadRequestException('You cannot deactivate or demote yourself');
    }
    const user = await this.users.findOneByOrFail({ id });
    await this.users.save(
      this.users.merge(user, {
        ...dto,
        ...(password && { passwordHash: await hash(password, 10) }),
      }),
    );
    return this.users.findOneByOrFail({ id });
  }
}
