import { proxyUsers } from '../route';

function segmentsFromContext(context) {
  return context?.params?.path || [];
}

export async function GET(request, context) {
  return proxyUsers(request, segmentsFromContext(context));
}

export async function POST(request, context) {
  return proxyUsers(request, segmentsFromContext(context));
}

export async function PATCH(request, context) {
  return proxyUsers(request, segmentsFromContext(context));
}

export async function DELETE(request, context) {
  return proxyUsers(request, segmentsFromContext(context));
}
