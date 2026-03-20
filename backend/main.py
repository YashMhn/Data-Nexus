from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import json

app = FastAPI(title="Data Viz API")

# Allow requests from our Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In a real app, restrict this to ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

@app.get("/api/data/bar-chart")
def get_bar_chart_data():
    # Mock data for frontend visualizations
    return [
        {"name": "Jan", "value": 400},
        {"name": "Feb", "value": 300},
        {"name": "Mar", "value": 500},
        {"name": "Apr", "value": 200},
        {"name": "May", "value": 600},
    ]

@app.get("/api/data/spatial")
def get_spatial_data():
    # Mock spatial data (e.g., GeoJSON or point data)
    return [
        {"id": 1, "lat": 51.505, "lng": -0.09, "title": "Location A"},
        {"id": 2, "lat": 51.51, "lng": -0.1, "title": "Location B"},
        {"id": 3, "lat": 51.515, "lng": -0.09, "title": "Location C"},
    ]

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Load dataset using pandas
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
    except Exception as e:
        return {"error": str(e)}
        
    # Type-aware NaN replacement: preserve numeric dtypes!
    # fillna("") on numeric columns silently converts them to 'object',
    # which breaks select_dtypes and all downstream aggregation.
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].fillna(0)
        else:
            df[col] = df[col].fillna("")
    
    # Cap massive datasets at 100,000 rows to ensure frontend browser stability.
    # Applying this globally immediately ensures the backend metrics exactly match the frontend's React aggregations!
    if len(df) > 100000:
        df = df.head(100000)
    
    # 1. Smart Parse: Find Spatial Data (Optimized Vectorization)
    spatial_data = []
    lat_col = next((c for c in df.columns if c.lower() in ['lat', 'latitude']), None)
    lng_col = next((c for c in df.columns if c.lower() in ['lng', 'lon', 'longitude']), None)
    
    if lat_col and lng_col:
        spatial_df = df.copy()
        spatial_df['lat'] = pd.to_numeric(spatial_df[lat_col], errors='coerce')
        spatial_df['lng'] = pd.to_numeric(spatial_df[lng_col], errors='coerce')
        spatial_df = spatial_df.dropna(subset=['lat', 'lng'])
        
        title_col = next((c for c in spatial_df.columns if c.lower() in ['title', 'name', 'address']), None)
        spatial_df['title'] = spatial_df[title_col].astype(str) if title_col else ("Row " + spatial_df.index.astype(str))
        
        # Limit to 1000 points so frontend Leaflet map doesn't freeze
        spatial_json = spatial_df.head(1000)[['lat', 'lng', 'title']].reset_index().rename(columns={"index": "id"}).to_json(orient="records")
        spatial_data = json.loads(spatial_json)

    # 2. Smart Parse: Find Chart Data and Metrics
    chart_data = []
    scatter_data = []
    metrics = {
        "total_rows": int(len(df)),
        "columns_count": int(len(df.columns)),
        "top_category": "N/A",
        "total_value": 0.0,
        "chart_subtitle": "",
        "scatter_subtitle": ""
    }
    
    str_cols = list(df.select_dtypes(include=['object', 'string']).columns)
    num_cols = list(df.select_dtypes(include=['number']).columns)
    
    # Filter out ID-like numeric columns from being the default pick
    # (they still remain available in the dropdown for users who want them)
    id_patterns = ['id', 'index', 'idx', 'row', 'serial', 'sr', 'no', 'sno']
    meaningful_num_cols = [c for c in num_cols if c.lower().strip() not in id_patterns 
                          and not c.lower().endswith('_id') 
                          and not c.lower().startswith('id_')]
    if not meaningful_num_cols:
        meaningful_num_cols = num_cols  # fallback to all if everything looks like an id
    
    # If we have a category and a number, group it!
    if len(str_cols) > 0 and len(meaningful_num_cols) > 0:
        name_col = str_cols[0]
        val_col = meaningful_num_cols[0]
        
        # Create standard chart data
        grouped = df.groupby(name_col)[val_col].sum().reset_index().sort_values(by=val_col, ascending=False).head(15)
        
        # Fast vectorized dict creation
        grouped['name'] = grouped[name_col].astype(str).str[:15]
        grouped['value'] = grouped[val_col].astype(float)
        chart_json = grouped[['name', 'value']].to_json(orient="records")
        chart_data = json.loads(chart_json)
        
        # Update Metrics
        if len(chart_data) > 0:
            metrics["top_category"] = chart_data[0]["name"]
            metrics["total_value"] = round(float(df[val_col].sum()), 2)
            metrics["chart_subtitle"] = f"Top 15 '{name_col}' aggregated by sum of '{val_col}'"
            
    # For scatter plots, just grab two numeric columns if available
    if len(num_cols) >= 2:
        scatter_df = df.head(100).copy()
        scatter_df['x'] = scatter_df[num_cols[0]].astype(float)
        scatter_df['y'] = scatter_df[num_cols[1]].astype(float)
        scatter_df['name'] = scatter_df[str_cols[0]].astype(str) if len(str_cols) > 0 else "Point"
        scatter_json = scatter_df[['x', 'y', 'name']].to_json(orient="records")
        scatter_data = json.loads(scatter_json)
        metrics["scatter_subtitle"] = f"Plotting '{num_cols[1]}' on Y-axis vs '{num_cols[0]}' on X-axis"
        
    return {
        "filename": file.filename,
        "columns": list(df.columns),
        "str_cols": str_cols,
        "num_cols": num_cols,
        "meaningful_num_cols": meaningful_num_cols,
        "total_rows": len(df),
        "spatial": spatial_data,
        "chart": chart_data,
        "scatter": scatter_data,
        "raw_data": json.loads(df.to_json(orient="records")),
        "metrics": metrics
    }
