FROM python:3.12.7-alpine3.20
WORKDIR /app
RUN addgroup --system shore && adduser --system --ingroup shore shore
COPY --chown=shore:shore src ./src
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
USER shore
EXPOSE 4100
CMD ["python", "src/server.py"]
