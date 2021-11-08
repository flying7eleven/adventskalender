input_file = ''
output_file = ''


def main():
    from csv import reader
    with open(input_file) as input_file_handle:
        csv_reader = reader(input_file_handle, delimiter=';')
        with open(output_file, mode='w+') as output_file_handle:
            for current_data_row in csv_reader:
                sql_line = f'INSERT INTO participants(first_name, last_name) VALUES ( \'{current_data_row[1].strip()}\', \'{current_data_row[0].strip()}\' );\n'
                output_file_handle.write(sql_line)


if __name__ == '__main__':
    main()
