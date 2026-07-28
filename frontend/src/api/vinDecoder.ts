import { request } from "./client";

const DECODE_BASE = "https://vpic.nhtsa.dot.gov/api";

interface VinDecodeHttpResponse {
    Count:          number;
    Message:        string;
    SearchCriteria: string;
    Results:        { 
        "ModelYear"?: string;
        "Make"?: string;
        "Model"?: string;
     }[];
}

export interface VinDecodeResult {
    isValid: boolean;
    year?: string;
    make?: string;
    model?: string;
}


export async function decodeVIN(vin: string): Promise<VinDecodeResult | null> {
    
    
    const response = await request<VinDecodeHttpResponse>(
    `/vehicles/decodevinvalues/${vin}?format=json`, 
    { 'method': 'GET' }, 
    DECODE_BASE );

    if (response && response.Count > 0 && response.Results.length > 0){
        return {
            isValid: true,
            year: response?.Results?.at(0)?.ModelYear,
            make: response?.Results.at(0)?.Make,  
            model: response?.Results.at(0)?.Model,    
        }
    }

    return null;

};