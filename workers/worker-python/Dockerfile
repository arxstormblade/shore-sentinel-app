FROM python:3.12-alpine
WORKDIR /app
COPY src ./src
ENV PYTHONPATH=/app
EXPOSE 4100
CMD ["python", "src/server.py"]
