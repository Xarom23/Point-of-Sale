import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';

type PgError = { code?: string; detail?: string };

/** Turns database errors into HTTP errors so services need no try/catch. */
@Catch(QueryFailedError, EntityNotFoundError)
export class DbExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DbExceptionFilter.name);

  catch(err: QueryFailedError | EntityNotFoundError, host: ArgumentsHost) {
    const http = this.toHttp(err);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(http.getStatus())
      .json(http.getResponse());
  }

  private toHttp(err: QueryFailedError | EntityNotFoundError): HttpException {
    if (err instanceof EntityNotFoundError) return new NotFoundException();

    const { code, detail = '' } = err.driverError as PgError;
    if (code === '23505') return new ConflictException(detail);
    if (code === '23503') {
      return detail.includes('still referenced')
        ? new ConflictException('Record is in use')
        : new BadRequestException('Related record not found');
    }
    this.logger.error(err);
    return new InternalServerErrorException();
  }
}
