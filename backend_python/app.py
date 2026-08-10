import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from werkzeug.utils import secure_filename
import datetime

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
db_config = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'tourist_db'
}

# File Upload Config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Moves up one level to 'tourpy', then into 'uploads'
UPLOAD_FOLDER = os.path.join(BASE_DIR, '../uploads') 
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def get_db_connection():
    try:
        conn = mysql.connector.connect(**db_config)
        return conn
    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

#  ROUTE 1: REGISTER TOURIST (The Form)
@app.route('/api/register', methods=['POST'])
def register_tourist():
    
    conn = get_db_connection()
    if not conn: return jsonify({'success': False, 'message': 'Database error'})
    
    try:
        cursor = conn.cursor()
        
        # 1. GENERATE REFERENCE NUMBER
        today_str = datetime.datetime.now().strftime("%Y%m%d")
        cursor.execute("SELECT COUNT(*) FROM registrations")
        count = cursor.fetchone()[0] + 1
        ref_no = f"TOUR-{today_str}-{count:04d}"
        
        # 2. GET DATA
        d = request.form
        
        # SQL Insert
        sql_reg = """
            INSERT INTO registrations (
                reference_number, registration_type, 
                first_name, middle_name, last_name, extension_name,
                dob, place_of_birth, gender, religion, 
                nationality, is_indigenous, indigenous_group,
                passport_status, passport_number,
                street_address, barangay, city, province, zipcode,
                emergency_first_name, emergency_last_name, emergency_middle_name,
                emergency_relationship, emergency_contact, emergency_email,
                purpose, travel_package, 
                status, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', NOW())
        """
        
        # Handle "Other" logic
        nationality = d.get('Nationality')
        if nationality == 'Other': nationality = d.get('otherNationality')

        religion = d.get('religion')
        if religion == 'Other': religion = d.get('otherReligion')

        indigenous_group = d.get('indigenousGroup') if d.get('indigenous') == 'yes' else ''
        if indigenous_group == 'Other': indigenous_group = d.get('otherIndigenousGroup')
        
        relationship = d.get('emergencyRelationship')
        if relationship == 'Other': relationship = d.get('otherRelationship')

        # Map HTML names to SQL values
        val_reg = (
            ref_no, 
            d.get('registrationType'),
            d.get('firstName'),
            d.get('middleName', ''),
            d.get('lastName'),
            d.get('extensionName', ''),
            d.get('dob'),
            d.get('placeOfBirth'),
            d.get('gender'),
            religion,
            nationality,
            d.get('indigenous', 'no'),
            indigenous_group,
            d.get('passportStatus'),
            d.get('passportNum', ''),
            d.get('streetAddress'),
            d.get('barangay'),
            d.get('city'),
            d.get('province'),
            d.get('zipCode'),
            d.get('emergencyFirstName'),
            d.get('emergencyLastName'),
            d.get('emergencyMiddleName', ''),
            relationship,
            d.get('emergencyContact'),
            d.get('emergencyEmail', ''),
            d.get('purpose'),
            d.get('trackPackage', '')
        )
        
        cursor.execute(sql_reg, val_reg)
        
        # 3. HANDLE FILE UPLOADS
        file_map = {
            'birthCertificate': 'Birth Certificate',
            'validID': 'Valid ID',
            'passportScan': 'Passport Scan',
            'itinerary': 'Travel Itinerary',
            'hotelProof': 'Accommodation Proof',
            'returnTicket': 'Return Ticket',
            'visa': 'Visa',
            'proofResidence': 'Proof of Residence'
        }
        
        for input_name, doc_type in file_map.items():
            file = request.files.get(input_name)
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                unique_name = f"{ref_no}_{input_name}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_name))
                
                # Insert Document
                sql_doc = "INSERT INTO documents (reference_number, document_type, file_path) VALUES (%s, %s, %s)"
                cursor.execute(sql_doc, (ref_no, doc_type, unique_name))

        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Registration Successful!', 'reference_number': ref_no})

    except Exception as e:
        print(f"REGISTRATION ERROR: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

# ==========================================================
#  ROUTE 2: TRACKING STATUS
# ==========================================================
@app.route('/api/tracking_status', methods=['GET'])
def tracking_status():
    ref = request.args.get('ref')
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM registrations WHERE reference_number = %s", (ref,))
    result = cursor.fetchone()
    conn.close()
    if result: return jsonify({'success': True, 'data': result})
    return jsonify({'success': False, 'message': 'Not found'})

# ==========================================================
#  ROUTE 3: ADMIN APIs (The Missing Part!)
# ==========================================================
@app.route('/api/admin/registrations', methods=['GET'])
def get_registrations():
    status = request.args.get('status', 'all')
    search = request.args.get('search', '')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    q = "SELECT * FROM registrations WHERE 1=1"
    p = []
    
    if status != 'all':
        q += " AND status = %s"
        p.append(status)
    if search:
        q += " AND (reference_number LIKE %s OR last_name LIKE %s OR first_name LIKE %s)"
        search_term = f"%{search}%"
        p.extend([search_term, search_term, search_term])
        
    # Count Total for Pagination
    count_q = q.replace("SELECT *", "SELECT COUNT(*) as total")
    cursor.execute(count_q, tuple(p))
    total_rows = cursor.fetchone()['total']
    total_pages = -(-total_rows // limit)

    q += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
    p.extend([limit, offset])
    
    cursor.execute(q, tuple(p))
    data = cursor.fetchall()
    conn.close()
    
    return jsonify({'success': True, 'data': {'registrations': data, 'total_pages': total_pages, 'current_page': page}})

@app.route('/api/admin/details', methods=['GET'])
def get_details():
    ref = request.args.get('ref')
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM registrations WHERE reference_number = %s", (ref,))
    tourist = cursor.fetchone()
    cursor.execute("SELECT * FROM documents WHERE reference_number = %s", (ref,))
    docs = cursor.fetchall()
    conn.close()
    if tourist:
        tourist['documents'] = docs
        return jsonify({'success': True, 'data': tourist})
    return jsonify({'success': False, 'message': 'Not found'})

@app.route('/api/admin/update_status', methods=['POST'])
def update_status():
    d = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE registrations SET status = %s, rejection_reason = %s WHERE reference_number = %s", 
                   (d.get('status'), d.get('reason'), d.get('ref')))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/delete', methods=['POST'])
def delete_reg():
    ref = request.json.get('reference_number')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents WHERE reference_number = %s", (ref,))
    cursor.execute("DELETE FROM registrations WHERE reference_number = %s", (ref,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/summary', methods=['GET'])
def get_summary():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT status, COUNT(*) as count FROM registrations GROUP BY status")
    stats = cursor.fetchall()
    conn.close()
    
    summary = {'pending_count': 0, 'approved_count': 0, 'rejected_count': 0}
    for row in stats:
        if row['status'] == 'pending': summary['pending_count'] = row['count']
        elif row['status'] == 'approved': summary['approved_count'] = row['count']
        elif row['status'] == 'rejected': summary['rejected_count'] = row['count']
        
    return jsonify({'success': True, 'data': summary})

if __name__ == '__main__':
    app.run(debug=True, port=5000)