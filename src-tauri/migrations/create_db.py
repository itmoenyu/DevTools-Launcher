import sqlite3

def create_db_from_sql(sql_file, db_file):
    # 读取 SQL 文件内容
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql_script = f.read()
    
    # 连接数据库（如果文件不存在会自动创建）
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # 执行整个脚本（注意：如果有多条语句，需使用 executescript）
    cursor.executescript(sql_script)
    
    conn.commit()
    conn.close()
    print(f"数据库 {db_file} 创建成功！")

if __name__ == "__main__":
    create_db_from_sql("001_init.sql", "services.db")