Pod::Spec.new do |s|
  s.name           = 'RestActivity'
  s.version        = '1.0.0'
  s.summary        = 'AlgoSplit rest-timer Live Activity lifecycle'
  s.description    = 'Starts, completes, and ends the rest-timer Live Activity with typed ActivityKit state.'
  s.author         = 'AlgoSplit'
  s.homepage       = 'https://github.com/palerdr/AlgoSplit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
