import sys


def escape_sql(value: str) -> str:
    return value.replace("'", "''")


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <input_file.csv> <output_file.sql>")
    input_file, output_file = sys.argv[1], sys.argv[2]

    from csv import reader
    with open(input_file) as input_file_handle:
        csv_reader = reader(input_file_handle, delimiter=';')
        with open(output_file, mode='w+') as output_file_handle:
            for current_data_row in csv_reader:
                sql_line = f'INSERT INTO participants(first_name, last_name) VALUES ( \'{escape_sql(current_data_row[0].strip())}\', \'{escape_sql(current_data_row[1].strip())}\' );\n'
                output_file_handle.write(sql_line)


if __name__ == '__main__':
    main()
