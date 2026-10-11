import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * أخطاء PostgreSQL الشائعة تتحوّل لرسائل مفهومة بدون تسريب تفاصيل قاعدة البيانات
 * (أسماء جداول/قيود/استعلامات) للعميل.
 */
const PG_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'DUPLICATE', message: 'البيانات موجودة بالفعل (قيمة مكررة)' },
  '23503': {
    status: 409,
    code: 'REFERENCE_CONSTRAINT',
    message: 'لا يمكن تنفيذ العملية لارتباط السجل ببيانات أخرى',
  },
  '23514': { status: 400, code: 'CHECK_CONSTRAINT', message: 'قيمة غير مسموح بها' },
  '23502': { status: 400, code: 'MISSING_VALUE', message: 'حقل مطلوب غير موجود' },
  '22P02': { status: 400, code: 'INVALID_INPUT', message: 'صيغة بيانات غير صحيحة' },
  '22003': { status: 400, code: 'NUMBER_OUT_OF_RANGE', message: 'الرقم خارج النطاق المسموح' },
  '22001': { status: 400, code: 'VALUE_TOO_LONG', message: 'النص أطول من المسموح' },
  '40001': { status: 409, code: 'CONFLICT_RETRY', message: 'تعارض مؤقت، أعد المحاولة' },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'حدث خطأ داخلي في الخادم';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      errorCode = HttpStatus[status] || 'ERROR';
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        errorCode = 'TOO_MANY_REQUESTS';
        message = 'طلبات كثيرة جداً. انتظر قليلاً ثم حاول مرة أخرى';
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse) {
        const body = exceptionResponse as Record<string, any>;
        message = body.message || message;
        errorCode =
          body.code ||
          (body.error ? String(body.error).toUpperCase().replace(/\s+/g, '_') : errorCode);
        if (body.feature) extra = { feature: body.feature };
      }
    } else {
      const pgCode = (exception as any)?.code ?? (exception as any)?.driverError?.code;
      const mapped = typeof pgCode === 'string' ? PG_ERRORS[pgCode] : undefined;
      if (mapped) {
        status = mapped.status;
        errorCode = mapped.code;
        message = mapped.message;
      }
      // أي خطأ غير متوقع: لا نرجع رسالته للعميل (ممكن تحتوي تفاصيل حساسة)
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl || request.url}`,
        exception instanceof Error ? exception.stack : String(exception)
      );
    } else if (status !== 401 && status !== 404) {
      this.logger.warn(`${request.method} ${request.originalUrl || request.url} -> ${status}`);
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        ...extra,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
