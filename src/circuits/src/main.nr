// Main circuit:
//  - p1: private feed with 2 decimal places (e.g., 30000 represents 300.00)
//  - p2: private feed with 4 decimal places (e.g., 3000000 represents 300.0000)
//  - asset_id: public (binds proof to an asset, e.g. TSLA)
// Returns: public (final_price with 2 decimals, asset_id)
// Throws an error if one price is more than 7% over the other
fn main(
    p1: u64,
    p2: u64,
    asset_id: pub str<4>,
) -> pub (u64, str<4>) {
    assert(p1 > 0);
    assert(p2 > 0);

    // Normalize both prices to 2 decimal places
    // p1 already has 2 decimals, keep as is
    // p2 has 4 decimals, divide by 100 to get 2 decimals
    let p1_normalized = p1;
    let p2_normalized = p2 / 100;

    let diff = if p1_normalized > p2_normalized { 
        p1_normalized - p2_normalized 
    } else { 
        p2_normalized - p1_normalized 
    };
    let max = if p1_normalized > p2_normalized { 
        p1_normalized 
    } else { 
        p2_normalized 
    };

    // Ensure prices are within 7% of each other, otherwise fail
    assert(diff * 100 <= max * 7);

    // Average the two normalized prices (both now have 2 decimal places)
    let final_price = (p1_normalized + p2_normalized) / 2;

    (final_price, asset_id)
}

#[test]
fn test_main() {
    let asset_id: str<4> = "TSLA";
    
    // Test Case 1: p1=300.00 (30000), p2=300.01 (3000100)
    // p2_normalized = 3000100 / 100 = 30001
    // average = (30000 + 30001) / 2 = 30000 (represents 300.00)
    let (price, id) = main(30000, 3000100, asset_id);
    assert(price == 30000);
    assert(id == asset_id);
    
    // Test Case 2: p1=100.50 (10050), p2=100.75 (1007500)
    // p2_normalized = 1007500 / 100 = 10075
    // average = (10050 + 10075) / 2 = 10062 (represents 100.62)
    let (price2, id2) = main(10050, 1007500, asset_id);
    assert(price2 == 10062);
    assert(id2 == asset_id);
    
    // Test Case 3: Equal prices p1=200.00 (20000), p2=200.00 (2000000)
    let (price3, id3) = main(20000, 2000000, asset_id);
    assert(price3 == 20000); // Represents 200.00
    assert(id3 == asset_id);
    
    // Test with different asset
    let asset_id_btc: str<4> = "BTC ";
    // p1=50000.00 (5000000), p2=50100.00 (501000000)
    // p2_normalized = 501000000 / 100 = 5010000
    // average = (5000000 + 5010000) / 2 = 5005000 (represents 50050.00)
    let (price4, id4) = main(5000000, 501000000, asset_id_btc);
    assert(price4 == 5005000);
    assert(id4 == asset_id_btc);
}
