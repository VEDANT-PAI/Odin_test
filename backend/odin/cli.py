import argparse
from pathlib import Path

from .config import get_settings
from .db import Base, SessionLocal, engine
from .importer import import_books, import_tags


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Odin's processed Goodreads data")
    parser.add_argument("--include-tags", action="store_true")
    args = parser.parse_args()
    data_dir = Path(get_settings().data_dir)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        count = import_books(db, data_dir / "books_clean.csv")
        print(f"Imported {count:,} books")
        if args.include_tags:
            links = import_tags(db, data_dir / "tags_clean.csv", data_dir / "book_tags_clean.csv")
            print(f"Processed {links:,} book-tag links")


if __name__ == "__main__":
    main()

