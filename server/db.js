import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { randomBytes, scryptSync } from 'node:crypto'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
}

const databaseName = process.env.DB_NAME || '威斯'
let pool

export async function initDatabase() {
  const bootstrap = await mysql.createConnection(dbConfig)
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(databaseName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await bootstrap.end()

  pool = mysql.createPool({ ...dbConfig, database: databaseName, waitForConnections: true, connectionLimit: 10, queueLimit: 0, decimalNumbers: true })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(64) NOT NULL UNIQUE,
      season VARCHAR(40) NULL,
      category VARCHAR(80) NOT NULL DEFAULT '',
      designer VARCHAR(80) NULL,
      designer_assistant VARCHAR(80) NULL,
      pattern_maker VARCHAR(80) NULL,
      release_date DATE NULL,
      link VARCHAR(500) NULL,
      season_type VARCHAR(40) NULL,
      color VARCHAR(80) NULL,
      composition VARCHAR(160) NULL,
      size VARCHAR(80) NULL,
      highlights TEXT NULL,
      priority VARCHAR(20) NULL,
      style_progress VARCHAR(30) NOT NULL DEFAULT '选图',
      style_progress_times TEXT NULL,
      pattern_progress VARCHAR(30) NOT NULL DEFAULT '分配中',
      pattern_started_at DATETIME NULL,
      pattern_progress_times TEXT NULL,
      material_notified TINYINT(1) NULL,
      material_arrived TINYINT(1) NULL,
      material_outsourced TINYINT(1) NULL,
      first_pattern_progress VARCHAR(30) NULL,
      first_pattern_image_url TEXT NULL,
      first_board_progress VARCHAR(30) NULL,
      first_board_maker VARCHAR(80) NULL,
      first_review_result VARCHAR(40) NULL,
      first_review_opinion_image_url TEXT NULL,
      second_pattern_progress VARCHAR(30) NULL,
      second_pattern_image_url TEXT NULL,
      second_board_progress VARCHAR(30) NULL,
      second_board_maker VARCHAR(80) NULL,
      second_review_result VARCHAR(40) NULL,
      second_review_opinion_image_url TEXT NULL,
      third_pattern_progress VARCHAR(30) NULL,
      third_pattern_image_url TEXT NULL,
      third_board_progress VARCHAR(30) NULL,
      third_board_maker VARCHAR(80) NULL,
      third_review_result VARCHAR(40) NULL,
      third_review_opinion_image_url TEXT NULL,
      preproduction_sample VARCHAR(40) NULL,
      has_pattern TINYINT(1) NULL,
      pattern_notes TEXT NULL,
      pattern_reference_image_url TEXT NULL,
      pattern_complete_style VARCHAR(160) NULL,
      pattern_complete_image_url TEXT NULL,
      design_pattern_progress VARCHAR(40) NULL,
      design_pattern_notes TEXT NULL,
      physical_image_url TEXT NULL,
      design_image_url TEXT NULL,
      front_back_image_url TEXT NULL,
      size_chart_url TEXT NULL,
      processing_fee_image_url TEXT NULL,
      price_image_url TEXT NULL,
      composition_image_url TEXT NULL,
      external_purchase_notes TEXT NULL,
      is_resale_to_self_developed TINYINT(1) NULL,
      external_purchase_progress VARCHAR(40) NULL,
      is_canceled TINYINT(1) NULL,
      canceled_at DATETIME NULL,
      supplier VARCHAR(120) NULL,
      channel VARCHAR(120) NULL,
      address VARCHAR(255) NULL,
      contact VARCHAR(120) NULL,
      product_url VARCHAR(1000) NULL,
      reference_link VARCHAR(1000) NULL,
      official_matching_sku VARCHAR(64) NULL,
      final_pattern_image_url VARCHAR(500) NULL,
      final_pattern_filename VARCHAR(255) NULL,
      matching_image_1 TEXT NULL,
      matching_sku_1 VARCHAR(64) NULL,
      matching_progress_1 VARCHAR(30) NULL,
      matching_image_2 TEXT NULL,
      matching_sku_2 VARCHAR(64) NULL,
      matching_progress_2 VARCHAR(30) NULL,
      matching_image_3 TEXT NULL,
      matching_sku_3 VARCHAR(64) NULL,
      matching_progress_3 VARCHAR(30) NULL,
      price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      pricing DECIMAL(12, 2) NOT NULL DEFAULT 0,
      processing_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
      reference_sales INT NULL,
      stock INT NOT NULL DEFAULT 0,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      description TEXT NULL,
      image_url TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_category (category), INDEX idx_products_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_fabrics (
      product_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_fabrics_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_accessories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT UNSIGNED NOT NULL,
      supplier VARCHAR(120) NULL,
      accessory VARCHAR(80) NULL,
      specification VARCHAR(160) NULL,
      color VARCHAR(80) NULL,
      dimension VARCHAR(40) NULL,
      unit_price DECIMAL(12, 2) NULL,
      usage_amount DECIMAL(12, 2) NULL,
      cost DECIMAL(12, 2) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_product_accessories_product (product_id),
      CONSTRAINT fk_product_accessories_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      position VARCHAR(80) NOT NULL,
      designer_user_id BIGINT UNSIGNED NULL,
      role VARCHAR(24) NOT NULL DEFAULT 'user',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [userColumns] = await pool.query('SHOW COLUMNS FROM app_users')
  if (!userColumns.some((column) => column.Field === 'role')) {
    await pool.query("ALTER TABLE app_users ADD COLUMN role VARCHAR(24) NOT NULL DEFAULT 'user' AFTER position")
  }
  if (!userColumns.some((column) => column.Field === 'is_active')) {
    await pool.query('ALTER TABLE app_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role')
  }
  if (!userColumns.some((column) => column.Field === 'designer_user_id')) {
    await pool.query('ALTER TABLE app_users ADD COLUMN designer_user_id BIGINT UNSIGNED NULL AFTER position')
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_user_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_app_user_sessions_expiry (expires_at),
      CONSTRAINT fk_app_user_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_operation_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actor_id BIGINT UNSIGNED NULL,
      actor_account VARCHAR(80) NOT NULL DEFAULT '',
      actor_position VARCHAR(80) NOT NULL DEFAULT '',
      action VARCHAR(255) NOT NULL,
      details TEXT NULL,
      method VARCHAR(10) NOT NULL,
      request_path VARCHAR(1000) NOT NULL,
      ip_address VARCHAR(64) NULL,
      status_code SMALLINT UNSIGNED NOT NULL DEFAULT 200,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_system_operation_logs_created_at (created_at),
      INDEX idx_system_operation_logs_actor (actor_account, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
      published_at DATETIME NULL,
      created_by BIGINT UNSIGNED NULL,
      created_by_account VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_announcements_status (status, published_at),
      INDEX idx_announcements_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [operationLogColumns] = await pool.query('SHOW COLUMNS FROM system_operation_logs')
  if (!operationLogColumns.some((column) => column.Field === 'details')) {
    await pool.query('ALTER TABLE system_operation_logs ADD COLUMN details TEXT NULL AFTER action')
  }
  const [userCountRows] = await pool.query('SELECT COUNT(*) AS count FROM app_users')
  if (Number(userCountRows[0].count) === 0) {
    const salt = randomBytes(16).toString('hex')
    const passwordHash = `${salt}:${scryptSync('12345678', salt, 64).toString('hex')}`
    await pool.query(
      "INSERT IGNORE INTO app_users (account, password_hash, position, role) VALUES ('admin', ?, '超级管理员', 'super_admin')",
      [passwordHash],
    )
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_crafts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT UNSIGNED NOT NULL,
      craft_type VARCHAR(40) NOT NULL DEFAULT '工艺',
      factory VARCHAR(120) NULL,
      process VARCHAR(120) NULL,
      price DECIMAL(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_product_crafts_product (product_id),
      CONSTRAINT fk_product_crafts_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const fabricTableColumns = [
    ['supplier', 'VARCHAR(120) NULL'], ['code', 'VARCHAR(80) NULL'], ['color_card_image_url', 'TEXT NULL'],
    ['color_code', 'VARCHAR(80) NULL'], ['width', 'VARCHAR(40) NULL'], ['quote', 'DECIMAL(12, 2) NULL'],
    ['weight_difference', 'DECIMAL(12, 2) NULL'],
    ['unit', 'VARCHAR(20) NULL'], ['meterage', 'DECIMAL(12, 2) NULL'], ['net_weight', 'DECIMAL(12, 2) NULL'], ['usage_amount', 'DECIMAL(12, 2) NULL'],
    ['cost', 'DECIMAL(12, 2) NULL'], ['inspection_report_url', 'TEXT NULL'],
  ]
  const [fabricColumns] = await pool.query('SHOW COLUMNS FROM product_fabrics')
  const fabricColumnNames = new Set(fabricColumns.map((column) => column.Field))
  if (!fabricColumnNames.has('id')) {
    await pool.query('ALTER TABLE product_fabrics ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST')
    await pool.query('ALTER TABLE product_fabrics DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD INDEX idx_product_fabrics_product (product_id)')
  }
  for (const [column, definition] of fabricTableColumns) {
    if (!fabricColumnNames.has(column)) await pool.query('ALTER TABLE product_fabrics ADD COLUMN `' + column + '` ' + definition)
  }
  for (const column of ['weight']) {
    if (fabricColumnNames.has(column)) await pool.query('ALTER TABLE product_fabrics DROP COLUMN `' + column + '`')
  }
  await pool.query('ALTER TABLE product_fabrics MODIFY COLUMN unit VARCHAR(20) NULL AFTER code')
  await pool.query('ALTER TABLE product_fabrics MODIFY COLUMN color_card_image_url TEXT NULL')
  await pool.query('ALTER TABLE product_fabrics MODIFY COLUMN inspection_report_url TEXT NULL')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      image_url VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(
    `INSERT IGNORE INTO product_categories (name, image_url) VALUES
      (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)`,
    [
      '针织衫', 'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=96&q=80',
      '衬衫', 'https://images.unsplash.com/photo-1603252110481-7ba873bf42ab?w=96&q=80',
      '裤装', 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=96&q=80',
      '外套', 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=96&q=80',
      '配饰', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?w=96&q=80',
      'T恤', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=96&q=80',
      '卫衣', 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=96&q=80',
      '连衣裙', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=96&q=80',
      '西装', 'https://images.unsplash.com/photo-1598808503746-f34c53b9323e?w=96&q=80',
      '羽绒服', 'https://images.unsplash.com/photo-1548624313-0396c75ce3b1?w=96&q=80'
    ],
  )
  await pool.query(
    `INSERT IGNORE INTO product_categories (name, image_url) VALUES
      (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?),
      (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)`,
    [
      '针织开衫', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=96&q=80',
      '针织上衣', 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=96&q=80',
      '毛衣', 'https://images.unsplash.com/photo-1611312449412-6cefac5dc3e4?w=96&q=80',
      '背心/吊带', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=96&q=80',
      '套装', 'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=96&q=80',
      '半身裙', 'https://images.unsplash.com/photo-1583496661160-fb5886a13d27?w=96&q=80',
      '休闲裤', 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=96&q=80',
      '牛仔裤', 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=96&q=80',
      '短外套', 'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?w=96&q=80',
      '雪纺衫', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=96&q=80',
      '腰带', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=96&q=80',
      '披肩', 'https://images.unsplash.com/photo-1601924928376-7b5e5e4f5e9c?w=96&q=80',
      '马甲', 'https://images.unsplash.com/photo-1610652492500-ded49ceeb378?w=96&q=80',
      '风衣', 'https://images.unsplash.com/photo-1548883354-7622d03aca27?w=96&q=80',
      '棉衣', 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=96&q=80',
      '羽绒服', 'https://images.unsplash.com/photo-1548624313-0396c75ce3b1?w=96&q=80',
      '皮衣', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=96&q=80',
      '皮草', 'https://images.unsplash.com/photo-1578681994506-b8f463449011?w=96&q=80',
      '环保皮革', 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=96&q=80'
    ],
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_designers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(
    `INSERT IGNORE INTO product_designers (name) VALUES (?), (?), (?), (?)`,
    ['林晓雯', '王思远', '周宁', '陈可'],
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_plans (
      category VARCHAR(80) NOT NULL PRIMARY KEY,
      group_name VARCHAR(80) NOT NULL DEFAULT '其他',
      sort_order INT NOT NULL DEFAULT 0,
      date_values JSON NOT NULL,
      self_developed DECIMAL(5, 2) NULL,
      follow_up DECIMAL(5, 2) NULL,
      outsource DECIMAL(5, 2) NULL,
      style_count INT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [categoryPlanColumnsWithOrder] = await pool.query('SHOW COLUMNS FROM category_plans')
  const categoryPlanColumnNames = new Set(categoryPlanColumnsWithOrder.map((column) => column.Field))
  if (!categoryPlanColumnNames.has('group_name')) await pool.query("ALTER TABLE category_plans ADD COLUMN group_name VARCHAR(80) NOT NULL DEFAULT '其他' AFTER category")
  if (!categoryPlanColumnNames.has('sort_order')) await pool.query('ALTER TABLE category_plans ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER group_name')
  const defaultCategoryOrder = [
    ['风衣', '上装', 9], ['西装', '上装', 3], ['皮衣', '外套', 11], ['棉衣', '外套', 12],
    ['羽绒服', '外套', 13], ['半身裙', '下装', 14], ['牛仔裤', '下装', 15],
    ['休闲裤', '下装', 16], ['连衣裙', '套装', 17],
  ]
  for (const [category, groupName, sortOrder] of defaultCategoryOrder) {
    await pool.query(
      "UPDATE category_plans SET group_name = IF(group_name = '' OR group_name = '其他', ?, group_name), sort_order = IF(sort_order = 0, ?, sort_order) WHERE category = ?",
      [groupName, sortOrder, category],
    )
  }
  await pool.query(`
    INSERT IGNORE INTO category_plans (category, date_values, self_developed, follow_up, outsource, style_count) VALUES
      ('风衣', '[]', 70, 30, NULL, 6),
      ('西装', '[]', 100, NULL, NULL, 28),
      ('皮衣', '[]', 100, NULL, NULL, 12),
      ('棉衣', '[]', 70, NULL, 30, 45),
      ('羽绒服', '[]', NULL, NULL, 100, 57),
      ('半身裙', '[]', 65, 35, NULL, 69),
      ('牛仔裤', '[]', NULL, NULL, 100, 59),
      ('休闲裤', '[]', 35, 35, 30, 106),
      ('连衣裙', '[]', 60, 30, 10, 61)
  `)
  const [categoryPlanColumns] = await pool.query('SHOW COLUMNS FROM category_plans')
  const dateValuesColumn = categoryPlanColumns.find((column) => column.Field === 'date_values')
  if (dateValuesColumn && !String(dateValuesColumn.Type).toLowerCase().startsWith('json')) {
    const [plans] = await pool.query('SELECT category, date_values FROM category_plans')
    for (const plan of plans) {
      let storedValues = []
      try {
        const parsed = JSON.parse(plan.date_values || '{}')
        storedValues = Array.isArray(parsed)
          ? parsed
          : Object.entries(parsed && typeof parsed === 'object' ? parsed : {}).map(([date, value]) => ({ date, value }))
      } catch { storedValues = [] }
      await pool.query('UPDATE category_plans SET date_values = ? WHERE category = ?', [JSON.stringify(storedValues), plan.category])
    }
    await pool.query('ALTER TABLE category_plans MODIFY COLUMN date_values JSON NOT NULL')
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_plan_dates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      date_label VARCHAR(20) NOT NULL UNIQUE,
      sort_order INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`
    INSERT IGNORE INTO category_plan_dates (date_label, sort_order) VALUES
      ('9月1日', 901), ('9月6日', 906), ('9月16日', 916), ('9月22日', 922), ('9月28日', 928),
      ('10月3日', 1003), ('10月9日', 1009), ('10月13日', 1013), ('10月17日', 1017), ('10月21日', 1021), ('10月30日', 1030),
      ('11月5日', 1105), ('11月10日', 1110), ('11月15日', 1115), ('11月20日', 1120), ('11月25日', 1125), ('11月30日', 1130),
      ('12月5日', 1205), ('12月11日', 1211), ('12月16日', 1216), ('12月21日', 1221), ('12月26日', 1226), ('12月30日', 1230)
  `)
  const [columns] = await pool.query('SHOW COLUMNS FROM products')
  const columnNames = new Set(columns.map((column) => column.Field))
  if (columnNames.has('name')) {
    const [nameIndexes] = await pool.query("SHOW INDEX FROM products WHERE Key_name = 'idx_products_name'")
    if (nameIndexes.length) await pool.query('ALTER TABLE products DROP INDEX idx_products_name')
    await pool.query('ALTER TABLE products DROP COLUMN name')
  }
  if (!columnNames.has('season')) await pool.query('ALTER TABLE products ADD COLUMN season VARCHAR(40) NULL AFTER sku')
  if (!columnNames.has('designer')) await pool.query('ALTER TABLE products ADD COLUMN designer VARCHAR(80) NULL AFTER category')
  const [productColumns] = await pool.query('SHOW COLUMNS FROM products')
  const productColumnNames = new Set(productColumns.map((column) => column.Field))
  if (!productColumnNames.has('release_date')) await pool.query('ALTER TABLE products ADD COLUMN release_date DATE NULL AFTER designer')
  if (!productColumnNames.has('link')) await pool.query('ALTER TABLE products ADD COLUMN link VARCHAR(500) NULL AFTER release_date')
  const extraColumns = [
    ['season_type', 'VARCHAR(40) NULL AFTER link'],
    ['color', 'VARCHAR(80) NULL AFTER season_type'],
    ['composition', 'VARCHAR(160) NULL AFTER color'],
    ['size', 'VARCHAR(80) NULL AFTER composition'],
    ['highlights', 'TEXT NULL AFTER size'],
    ['priority', 'VARCHAR(20) NULL AFTER highlights'],
    ['style_progress', "VARCHAR(30) NOT NULL DEFAULT '选图' AFTER priority"],
    ['style_progress_times', 'TEXT NULL AFTER style_progress'],
    ['pattern_progress', "VARCHAR(30) NOT NULL DEFAULT '分配中' AFTER style_progress_times"],
    ['pattern_started_at', 'DATETIME NULL AFTER pattern_progress'],
    ['pattern_progress_times', 'TEXT NULL AFTER pattern_progress'],
    ['material_notified', 'TINYINT(1) NULL AFTER pattern_progress_times'],
    ['material_arrived', 'TINYINT(1) NULL AFTER pattern_progress_times'],
    ['material_outsourced', 'TINYINT(1) NULL AFTER material_arrived'],
    ['first_pattern_progress', 'VARCHAR(30) NULL AFTER pattern_progress'],
    ['first_pattern_image_url', 'TEXT NULL AFTER first_pattern_progress'],
    ['first_board_progress', 'VARCHAR(30) NULL AFTER first_pattern_progress'],
    ['first_board_maker', 'VARCHAR(80) NULL AFTER first_board_progress'],
    ['first_review_result', 'VARCHAR(40) NULL AFTER first_board_maker'],
    ['first_review_opinion_image_url', 'TEXT NULL AFTER first_review_result'],
    ['second_pattern_progress', 'VARCHAR(30) NULL AFTER first_review_result'],
    ['second_pattern_image_url', 'TEXT NULL AFTER second_pattern_progress'],
    ['second_board_progress', 'VARCHAR(30) NULL AFTER second_pattern_progress'],
    ['second_board_maker', 'VARCHAR(80) NULL AFTER second_board_progress'],
    ['second_review_result', 'VARCHAR(40) NULL AFTER second_board_maker'],
    ['second_review_opinion_image_url', 'TEXT NULL AFTER second_review_result'],
    ['third_pattern_progress', 'VARCHAR(30) NULL AFTER second_review_result'],
    ['third_pattern_image_url', 'TEXT NULL AFTER third_pattern_progress'],
    ['third_board_progress', 'VARCHAR(30) NULL AFTER third_pattern_progress'],
    ['third_board_maker', 'VARCHAR(80) NULL AFTER third_board_progress'],
    ['third_review_result', 'VARCHAR(40) NULL AFTER third_board_maker'],
    ['third_review_opinion_image_url', 'TEXT NULL AFTER third_review_result'],
    ['preproduction_sample', 'VARCHAR(40) NULL AFTER pattern_progress'],
    ['preproduction_board_progress', 'VARCHAR(30) NULL AFTER preproduction_sample'],
    ['preproduction_board_maker', 'VARCHAR(80) NULL AFTER preproduction_board_progress'],
    ['has_pattern', 'TINYINT(1) NULL AFTER priority'],
    ['pattern_notes', 'TEXT NULL AFTER has_pattern'],
    ['pattern_reference_image_url', 'VARCHAR(500) NULL AFTER pattern_notes'],
    ['pattern_complete_style', 'VARCHAR(160) NULL AFTER pattern_reference_image_url'],
    ['pattern_complete_image_url', 'VARCHAR(500) NULL AFTER pattern_complete_style'],
    ['design_pattern_progress', 'VARCHAR(40) NULL AFTER pattern_complete_image_url'],
    ['design_pattern_notes', 'TEXT NULL AFTER design_pattern_progress'],
    ['physical_image_url', 'VARCHAR(500) NULL AFTER pattern_notes'],
    ['design_image_url', 'VARCHAR(500) NULL AFTER physical_image_url'],
    ['front_back_image_url', 'VARCHAR(500) NULL AFTER design_image_url'],
    ['size_chart_url', 'VARCHAR(500) NULL AFTER front_back_image_url'],
    ['processing_fee_image_url', 'TEXT NULL AFTER size_chart_url'],
    ['price_image_url', 'VARCHAR(500) NULL AFTER size_chart_url'],
    ['composition_image_url', 'VARCHAR(500) NULL AFTER composition'],
    ['external_purchase_notes', 'TEXT NULL AFTER pattern_notes'],
    ['is_resale_to_self_developed', 'TINYINT(1) NULL AFTER external_purchase_notes'],
    ['external_purchase_progress', 'VARCHAR(40) NULL AFTER is_resale_to_self_developed'],
    ['is_canceled', 'TINYINT(1) NULL AFTER external_purchase_progress'],
    ['canceled_at', 'DATETIME NULL AFTER is_canceled'],
    ['supplier', 'VARCHAR(120) NULL AFTER is_canceled'],
    ['channel', 'VARCHAR(120) NULL AFTER supplier'],
    ['address', 'VARCHAR(255) NULL AFTER channel'],
    ['contact', 'VARCHAR(120) NULL AFTER address'],
    ['product_url', 'VARCHAR(1000) NULL AFTER contact'],
    ['reference_link', 'VARCHAR(1000) NULL AFTER product_url'],
    ['official_matching_sku', 'VARCHAR(64) NULL AFTER reference_link'],
    ['pricing', 'DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER price'],
    ['processing_fee', 'DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER pricing'],
    ['reference_sales', 'INT NULL AFTER processing_fee'],
    ['final_pattern_image_url', 'VARCHAR(500) NULL AFTER size_chart_url'],
    ['final_pattern_filename', 'VARCHAR(255) NULL AFTER final_pattern_image_url'],
    ['matching_image_1', 'TEXT NULL AFTER final_pattern_filename'],
    ['matching_sku_1', 'VARCHAR(64) NULL AFTER matching_image_1'],
    ['matching_progress_1', 'VARCHAR(30) NULL AFTER matching_sku_1'],
    ['matching_image_2', 'TEXT NULL AFTER matching_progress_1'],
    ['matching_sku_2', 'VARCHAR(64) NULL AFTER matching_image_2'],
    ['matching_progress_2', 'VARCHAR(30) NULL AFTER matching_sku_2'],
    ['matching_image_3', 'TEXT NULL AFTER matching_progress_2'],
    ['matching_sku_3', 'VARCHAR(64) NULL AFTER matching_image_3'],
    ['matching_progress_3', 'VARCHAR(30) NULL AFTER matching_sku_3'],
    ['pattern_maker', 'VARCHAR(80) NULL AFTER designer'],
    ['designer_assistant', 'VARCHAR(80) NULL AFTER designer'],
  ]
  for (const [column, definition] of extraColumns) {
    if (!productColumnNames.has(column)) await pool.query('ALTER TABLE products ADD COLUMN `' + column + '` ' + definition)
  }
  await pool.query('UPDATE products SET pricing = 0 WHERE pricing IS NULL')
  await pool.query('ALTER TABLE products MODIFY COLUMN pricing DECIMAL(12, 2) NOT NULL DEFAULT 0')
  for (const column of ['image_url', 'physical_image_url', 'design_image_url', 'front_back_image_url', 'size_chart_url', 'price_image_url', 'composition_image_url', 'pattern_reference_image_url', 'pattern_complete_image_url', 'matching_image_1', 'matching_image_2', 'matching_image_3']) {
    await pool.query(`ALTER TABLE products MODIFY COLUMN \`${column}\` TEXT NULL`)
  }
  await pool.query('UPDATE products SET canceled_at = CURRENT_TIMESTAMP WHERE is_canceled = 1 AND canceled_at IS NULL')

  const legacyMaterialColumns = ['fabric_notes', 'fabric_image_url', 'accessory_notes', 'accessory_image_url']
  const [currentProductColumns] = await pool.query('SHOW COLUMNS FROM products')
  const currentProductColumnNames = new Set(currentProductColumns.map((column) => column.Field))
  if (legacyMaterialColumns.some((column) => currentProductColumnNames.has(column))) {
    const [legacyFabricColumns] = await pool.query('SHOW COLUMNS FROM product_fabrics')
    const legacyFabricColumnNames = new Set(legacyFabricColumns.map((column) => column.Field))
    if (legacyFabricColumnNames.has('notes') && legacyFabricColumnNames.has('image_url')) {
      await pool.query(`INSERT IGNORE INTO product_fabrics (product_id, notes, image_url) SELECT id, fabric_notes, fabric_image_url FROM products WHERE fabric_notes IS NOT NULL OR fabric_image_url IS NOT NULL`)
    }
    const [legacyAccessoryColumns] = await pool.query('SHOW COLUMNS FROM product_accessories')
    const legacyAccessoryColumnNames = new Set(legacyAccessoryColumns.map((column) => column.Field))
    if (legacyAccessoryColumnNames.has('notes') && legacyAccessoryColumnNames.has('image_url')) {
      await pool.query(`INSERT IGNORE INTO product_accessories (product_id, notes, image_url) SELECT id, accessory_notes, accessory_image_url FROM products WHERE accessory_notes IS NOT NULL OR accessory_image_url IS NOT NULL`)
    }
    for (const column of legacyMaterialColumns) {
      if (currentProductColumnNames.has(column)) await pool.query('ALTER TABLE products DROP COLUMN `' + column + '`')
    }
  }

  const [accessoryColumns] = await pool.query('SHOW COLUMNS FROM product_accessories')
  const accessoryColumnNames = new Set(accessoryColumns.map((column) => column.Field))
  if (!accessoryColumnNames.has('id')) {
    await pool.query('ALTER TABLE product_accessories ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST')
    await pool.query('ALTER TABLE product_accessories DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD INDEX idx_product_accessories_product (product_id)')
  }
  const accessoryTableColumns = [
    ['supplier', 'VARCHAR(120) NULL'], ['accessory', 'VARCHAR(80) NULL'], ['specification', 'VARCHAR(160) NULL'],
    ['color', 'VARCHAR(80) NULL'], ['unit', 'VARCHAR(40) NULL'], ['unit_price', 'DECIMAL(12, 2) NULL'],
    ['usage_amount', 'DECIMAL(12, 2) NULL'], ['cost', 'DECIMAL(12, 2) NULL'],
  ]
  if (accessoryColumnNames.has('dimension') && !accessoryColumnNames.has('unit')) {
    await pool.query('ALTER TABLE product_accessories CHANGE COLUMN dimension unit VARCHAR(40) NULL')
    accessoryColumnNames.delete('dimension')
    accessoryColumnNames.add('unit')
  }
  for (const [column, definition] of accessoryTableColumns) {
    if (!accessoryColumnNames.has(column)) await pool.query('ALTER TABLE product_accessories ADD COLUMN `' + column + '` ' + definition)
  }
  if (accessoryColumnNames.has('dimension') && accessoryColumnNames.has('unit')) {
    await pool.query('ALTER TABLE product_accessories DROP COLUMN dimension')
  }
  for (const column of ['notes', 'image_url']) {
    if (accessoryColumnNames.has(column)) await pool.query('ALTER TABLE product_accessories DROP COLUMN `' + column + '`')
  }

  const obsoleteFabricColumns = ['notes', 'image_url', 'bulk_price', 'loss', 'cutting_price', 'composition', 'filled_by', 'shrinkage_rate']
  const [latestFabricColumns] = await pool.query('SHOW COLUMNS FROM product_fabrics')
  const latestFabricColumnNames = new Set(latestFabricColumns.map((column) => column.Field))
  for (const column of obsoleteFabricColumns) {
    if (latestFabricColumnNames.has(column)) await pool.query('ALTER TABLE product_fabrics DROP COLUMN `' + column + '`')
  }

  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM products')
  if (Number(countRows[0].count) === 0) {
    await pool.query(
      `INSERT INTO products (sku, category, price, stock, status, description)
       VALUES (?, ?, ?, ?, 'active', ?), (?, ?, ?, ?, 'active', ?), (?, ?, ?, ?, 'inactive', ?)`,
      ['WS-KN-24021', '针织衫', 286, 23, '轻盈透气，适合春夏日常搭配。', 'WS-SH-24006', '衬衫', 358, 16, '天然亚麻面料，宽松舒适。', 'WS-KU-24018', '裤装', 428, 8, '利落剪裁，适合通勤场景。'],
    )
  }
}

export function getPool() {
  if (!pool) throw new Error('数据库尚未初始化')
  return pool
}
