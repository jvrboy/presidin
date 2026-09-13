from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)

if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models.entities import Account, AlertRule, AnalysisSnapshot, BacktestRun, MetaModel, MistakeLog, NeuralModel, NotificationDelivery, PaperOrder, PriceData, Signal, SignalOutcome, StrategyDefinition, StrategyMetrics, Trade, TrainingRun  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # Keep existing SQLite installs self-starting while a full migration
    # framework is not yet present. New rows are owner-scoped by the API.
    if settings.database_url.startswith("sqlite"):
        columns = {column["name"] for column in inspect(engine).get_columns("paper_orders")}
        if "owner_username" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE paper_orders ADD COLUMN owner_username VARCHAR(100)"))
            with engine.begin() as connection:
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_orders_owner_username ON paper_orders (owner_username)"))
