<?php
header('Content-Type: application/json');

// simple helper for JSON response
function resp($arr) {
  echo json_encode($arr);
  exit;
}

// create data dir
$base = __DIR__;
$dataDir = $base . DIRECTORY_SEPARATOR . 'seatmaps';
if (!is_dir($dataDir)) {
  mkdir($dataDir, 0777, true);
}

$method = $_SERVER['REQUEST_METHOD'];

// POST handling: either file upload 'csv' or JSON body to save layout
if ($method === 'POST') {
  // handle multipart CSV upload
  if (isset($_FILES['csv'])) {
    $tmp = $_FILES['csv']['tmp_name'];
    if (!is_uploaded_file($tmp)) resp(['status'=>'error','message'=>'No uploaded file']);
    $rows = array_map('str_getcsv', file($tmp));
    $students = [];
    foreach ($rows as $r) {
      if (!isset($r[0])) continue;
      $name = trim($r[0]);
      if ($name === '') continue;
      $email = isset($r[1]) ? trim($r[1]) : '';
      $students[] = ['name'=>$name, 'email'=>$email];
    }
    resp(['status'=>'ok','students'=>$students]);
  }

  // otherwise try to read JSON body (layout save)
  $raw = file_get_contents('php://input');
  if ($raw) {
    $data = json_decode($raw, true);
    if (!$data) resp(['status'=>'error','message'=>'Invalid JSON body']);
    $filename = 'seatmap_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.json';
    $path = $dataDir . DIRECTORY_SEPARATOR . $filename;
    if (file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT))) {
      resp(['status'=>'ok','file'=>$filename]);
    } else {
      resp(['status'=>'error','message'=>'Failed to write file']);
    }
  }

  resp(['status'=>'error','message'=>'No data received']);
}

// GET handling: list files or load a file
if ($method === 'GET') {
  if (isset($_GET['list']) && ($_GET['list']=='1' || $_GET['list']=='true')) {
    $files = array_values(array_filter(scandir($dataDir), function($f) use ($dataDir){
      return is_file($dataDir . DIRECTORY_SEPARATOR . $f) && preg_match('/\.json$/i', $f);
    }));
    resp(['status'=>'ok','files'=>$files]);
  }

  if (isset($_GET['load'])) {
    $file = basename($_GET['load']);
    $path = $dataDir . DIRECTORY_SEPARATOR . $file;
    if (!file_exists($path)) resp(['status'=>'error','message'=>'File not found']);
    $content = file_get_contents($path);
    $json = json_decode($content, true);
    if ($json === null) {
      // maybe file is raw JSON but not decodable? return raw then
      resp(['status'=>'error','message'=>'Corrupt file']);
    }
    resp($json);
  }

  resp(['status'=>'error','message'=>'Unsupported GET usage. Use ?list=1 or ?load=FILENAME']);
}

resp(['status'=>'error','message'=>'Unsupported request method']);
