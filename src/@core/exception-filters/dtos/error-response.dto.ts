/** SPEC-LITERAL: exactly these two keys. No `statusCode`, no `code`. */
export type RejectionErrorBody = {
  status: 'rejected';
  reason: string;
};

export type ConflictErrorBody = {
  statusCode: number;
  code: number;
  reason: string;
  resourceId: string | null;
};

export type GatewayValidationErrorBody = {
  statusCode: number;
  code: number;
  message: string;
  field: string;
};

export type GenericErrorBody = {
  statusCode: number;
  code: number;
  message: string;
};

export type InternalErrorBody = {
  statusCode: number;
  message: string;
};

export type ErrorResponseBody =
  | RejectionErrorBody
  | ConflictErrorBody
  | GatewayValidationErrorBody
  | GenericErrorBody
  | InternalErrorBody;

export type ErrorResponse = {
  statusCode: number;
  body: Readonly<ErrorResponseBody>;
};
