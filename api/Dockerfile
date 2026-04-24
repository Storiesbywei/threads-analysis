FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 4323
CMD ["gunicorn", "-b", "0.0.0.0:4323", "-w", "2", "--timeout", "120", "--access-logfile", "-", "app:app"]
